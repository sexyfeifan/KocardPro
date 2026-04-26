import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import type {
  BackupTask,
  FileRecord,
  HashAlgorithm,
  ProgressPayload,
  TaskConfig
} from '../types'

export class BackupEngine extends EventEmitter {
  private tasks: Map<string, BackupTask> = new Map()
  private cancelFlags: Map<string, boolean> = new Map()

  createTask(config: TaskConfig): BackupTask {
    const now = new Date()
    const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
    const timestamp =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes())
    const volumeName = config.namingTemplate
      ? `${config.namingTemplate}_${timestamp}`
      : `Untitled_${timestamp}`

    const task: BackupTask = {
      id: uuidv4(),
      name: config.name,
      sourcePath: config.sourcePath,
      devices: config.devices,
      destinations: config.destinationPaths.map((p, i) => ({
        id: uuidv4(),
        path: p,
        label: `备份 ${i + 1}`,
        verified: false,
        bytesWritten: 0
      })),
      hashAlgorithm: config.hashAlgorithm,
      namingTemplate: volumeName,
      status: 'pending',
      totalFiles: 0,
      completedFiles: 0,
      totalBytes: 0,
      transferredBytes: 0,
      speedBps: 0,
      eta: 0,
      currentFile: '',
      verifyLog: [],
      fileRecords: []
    }
    this.tasks.set(task.id, task)
    return task
  }

  loadTask(task: BackupTask): void {
    this.tasks.set(task.id, task)
  }

  getTask(taskId: string): BackupTask | undefined {
    return this.tasks.get(taskId)
  }

  getAllTasks(): BackupTask[] {
    return Array.from(this.tasks.values())
  }

  cancelTask(taskId: string): void {
    this.cancelFlags.set(taskId, true)
  }

  deleteTask(taskId: string): void {
    this.tasks.delete(taskId)
    this.cancelFlags.delete(taskId)
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    this.cancelFlags.set(taskId, false)
    task.status = 'running'
    task.startedAt = Date.now()
    task.verifyLog = []

    // Parse shooting date from namingTemplate context; fallback to today
    // The volume name is already resolved; use it as the folder name
    const volumeName = task.namingTemplate

    try {
      const files = await this.enumerateFiles(task.sourcePath)
      task.totalFiles = files.length
      task.totalBytes = files.reduce((sum, f) => sum + f.size, 0)
      this.emitProgress(task)

      // Build destination roots: dest/volumeName/deviceName for each device
      for (const dest of task.destinations) {
        // We'll create per-device subfolders during copy; store the volume root
        const volumeRoot = path.join(dest.path, volumeName)
        await fs.promises.mkdir(volumeRoot, { recursive: true })
        dest.resolvedPath = volumeRoot
      }

      let speedSamples: number[] = []
      let lastBytes = 0
      let lastTime = Date.now()

      for (const file of files) {
        if (this.cancelFlags.get(taskId)) {
          task.status = 'cancelled'
          this.emitProgress(task)
          return
        }

        task.currentFile = file.name
        this.emitProgress(task)

        const record = await this.copyFileToAllDestinationsParallel(
          task,
          file,
          (bytesWritten) => {
            task.transferredBytes += bytesWritten
            const now = Date.now()
            const elapsed = (now - lastTime) / 1000
            if (elapsed >= 0.5) {
              const currentSpeed = (task.transferredBytes - lastBytes) / elapsed
              speedSamples.push(currentSpeed)
              if (speedSamples.length > 5) speedSamples.shift()
              task.speedBps = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
              lastBytes = task.transferredBytes
              lastTime = now
              const remaining = task.totalBytes - task.transferredBytes
              task.eta = task.speedBps > 0 ? remaining / task.speedBps : 0
              this.emitProgress(task)
            }
          }
        )

        task.fileRecords.push(record)
        task.completedFiles++
        this.emitProgress(task)
      }

      task.status = 'verifying'
      this.emitProgress(task)
      await this.verifyAllDestinations(task)

      task.status = 'completed'
      task.completedAt = Date.now()
      task.currentFile = ''
      task.speedBps = 0
      task.eta = 0
      this.emitProgress(task)
    } catch (err) {
      task.status = 'failed'
      task.errorMessage = (err as Error).message
      this.emitProgress(task)
      throw err
    }
  }

  private async copyFileToAllDestinationsParallel(
    task: BackupTask,
    file: { name: string; relativePath: string; size: number; absolutePath: string },
    onProgress: (bytes: number) => void
  ): Promise<FileRecord> {
    const srcChecksum = await this.hashFile(file.absolutePath, task.hashAlgorithm)

    const destResults = await Promise.all(
      task.destinations.map(async (dest) => {
        const volumeRoot = dest.resolvedPath ?? dest.path
        // Write files into each device subfolder
        const deviceSubfolders = task.devices.length > 0 ? task.devices : ['']
        const results = await Promise.all(
          deviceSubfolders.map(async (device) => {
            const deviceRoot = device ? path.join(volumeRoot, device) : volumeRoot
            const destFilePath = path.join(deviceRoot, file.relativePath)
            await fs.promises.mkdir(path.dirname(destFilePath), { recursive: true })

            await this.copyFile(file.absolutePath, destFilePath, (bytes) => {
              dest.bytesWritten += bytes
              onProgress(bytes / (task.destinations.length * deviceSubfolders.length))
            })

            const destChecksum = await this.hashFile(destFilePath, task.hashAlgorithm)
            const verified = destChecksum === srcChecksum
            if (!verified) {
              dest.error = `校验失败: ${file.relativePath}`
            }
            return { path: destFilePath, checksum: destChecksum, verified }
          })
        )
        // Use the first device result as the canonical destination result
        return results[0]
      })
    )

    return {
      name: file.name,
      relativePath: file.relativePath,
      size: file.size,
      srcChecksum,
      destinations: destResults
    }
  }

  private copyFile(src: string, dest: string, onProgress: (bytes: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(src, { highWaterMark: 2 * 1024 * 1024 })
      const writeStream = fs.createWriteStream(dest)

      readStream.on('data', (chunk: Buffer | string) => {
        onProgress(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk))
      })

      readStream.on('error', reject)
      writeStream.on('error', reject)
      writeStream.on('finish', resolve)

      readStream.pipe(writeStream)
    })
  }

  private hashFile(filePath: string, algorithm: HashAlgorithm): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm)
      const stream = fs.createReadStream(filePath, { highWaterMark: 2 * 1024 * 1024 })
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private async verifyAllDestinations(task: BackupTask): Promise<void> {
    task.verifyLog = []

    for (const dest of task.destinations) {
      const volumeRoot = dest.resolvedPath ?? dest.path
      let allVerified = true

      for (const record of task.fileRecords) {
        if (this.cancelFlags.get(task.id)) break

        // Re-verify each file in each device subfolder
        const deviceSubfolders = task.devices.length > 0 ? task.devices : ['']
        let fileOk = true

        for (const device of deviceSubfolders) {
          const deviceRoot = device ? path.join(volumeRoot, device) : volumeRoot
          const destFilePath = path.join(deviceRoot, record.relativePath)

          try {
            const destChecksum = await this.hashFile(destFilePath, task.hashAlgorithm)
            const verified = destChecksum === record.srcChecksum
            if (!verified) {
              fileOk = false
              const msg = `✗ ${record.name} [${device || dest.path}]`
              task.verifyLog.push(msg)
              if (task.verifyLog.length > 100) task.verifyLog.shift()
            } else {
              const msg = `✓ ${record.name} [${device || dest.path}]`
              task.verifyLog.push(msg)
              if (task.verifyLog.length > 100) task.verifyLog.shift()
            }
            this.emitProgress(task)
          } catch {
            fileOk = false
            task.verifyLog.push(`✗ ${record.name} 读取失败`)
            if (task.verifyLog.length > 100) task.verifyLog.shift()
            this.emitProgress(task)
          }
        }

        if (!fileOk) allVerified = false
      }

      dest.verified = allVerified
    }
  }

  private async enumerateFiles(
    dirPath: string,
    baseDir?: string
  ): Promise<Array<{ name: string; relativePath: string; size: number; absolutePath: string }>> {
    const base = baseDir ?? dirPath
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results: Array<{
      name: string
      relativePath: string
      size: number
      absolutePath: string
    }> = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const nested = await this.enumerateFiles(fullPath, base)
        results.push(...nested)
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath)
        results.push({
          name: entry.name,
          relativePath: path.relative(base, fullPath),
          size: stat.size,
          absolutePath: fullPath
        })
      }
    }
    return results
  }

  private emitProgress(task: BackupTask): void {
    const payload: ProgressPayload = {
      taskId: task.id,
      status: task.status,
      totalFiles: task.totalFiles,
      completedFiles: task.completedFiles,
      totalBytes: task.totalBytes,
      transferredBytes: task.transferredBytes,
      speedBps: task.speedBps,
      eta: task.eta,
      currentFile: task.currentFile,
      verifyLog: [...task.verifyLog],
      destinations: task.destinations,
      errorMessage: task.errorMessage
    }
    this.emit('progress', payload)
  }
}
