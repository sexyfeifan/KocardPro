import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  BackupTask,
  Destination,
  DestinationRecord,
  DriveInfo,
  FileRecord,
  ProgressPayload,
  ProjectPreset,
  TaskConfig,
  TaskMetadata,
  TaskSummary,
  VerificationStatus
} from '../types'

interface EnumeratedFile {
  name: string
  relativePath: string
  size: number
  absolutePath: string
}

interface EnumerationResult {
  files: EnumeratedFile[]
  directoryCount: number
}

interface BackupEngineOptions {
  getDriveInfo: (dirPath: string) => Promise<DriveInfo | null>
  appendTaskLog: (taskId: string, message: string) => Promise<void>
}

const CANCELLED_ERROR = 'TASK_CANCELLED'

function now(): number {
  return Date.now()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCompactTimestamp(value: Date): string {
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}${pad(value.getHours())}${pad(value.getMinutes())}`
}

function normalizeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function compactDate(value: string): string {
  return normalizeDate(value).replaceAll('-', '')
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
  if (!sanitized || sanitized === '.' || sanitized === '..') return '未命名'
  return sanitized
}

function isSubPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function buildSummary(
  destinations: Destination[],
  directoryCount: number,
  verificationCompletedFiles = 0
): TaskSummary {
  return {
    directoryCount,
    failedDestinations: destinations.filter((destination) => destination.verificationStatus === 'failed').length,
    verifiedDestinations: destinations.filter((destination) => destination.verificationStatus === 'verified').length,
    verificationCompletedFiles
  }
}

function createCancelledError(): Error {
  const error = new Error(CANCELLED_ERROR)
  error.name = CANCELLED_ERROR
  return error
}

function normalizeProjectDeviceNames(deviceNames: string[], currentDevice: string): string[] {
  const values = deviceNames
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => sanitizePathSegment(item))
  const deduped = Array.from(new Set(values))
  const normalizedCurrent = currentDevice.trim() ? sanitizePathSegment(currentDevice) : deduped[0] ?? 'A-Cam'
  return Array.from(new Set([...deduped, normalizedCurrent]))
}

function normalizeMetadata(metadata: TaskMetadata): TaskMetadata {
  const shootDate = normalizeDate(metadata.shootDate)
  const currentDevice = metadata.currentDevice.trim() ? sanitizePathSegment(metadata.currentDevice) : 'A-Cam'
  const projectDeviceNames = normalizeProjectDeviceNames(metadata.projectDeviceNames, currentDevice)

  return {
    projectName: metadata.projectName.trim(),
    projectPresetId: metadata.projectPresetId,
    projectDeviceNames,
    currentDevice: projectDeviceNames.includes(currentDevice) ? currentDevice : projectDeviceNames[0],
    shootDate,
    shootDateCompact: metadata.shootDateCompact || compactDate(shootDate),
    rollName: metadata.rollName.trim() ? sanitizePathSegment(metadata.rollName) : 'Untitled',
    timeStampCompact:
      /^\d{12}$/.test(metadata.timeStampCompact) ? metadata.timeStampCompact : formatCompactTimestamp(new Date())
  }
}

export function buildProjectPresetFromTask(config: TaskConfig): ProjectPreset {
  const metadata = normalizeMetadata(config.metadata)
  return {
    id: config.metadata.projectPresetId || uuidv4(),
    name: metadata.projectName,
    deviceNames: metadata.projectDeviceNames,
    hashAlgorithm: config.hashAlgorithm,
    namingTemplate: config.namingTemplate,
    verifyAfterCopy: config.verifyAfterCopy,
    updatedAt: now()
  }
}

export class BackupEngine extends EventEmitter {
  private readonly tasks: Map<string, BackupTask> = new Map()
  private readonly cancelFlags: Map<string, boolean> = new Map()
  private readonly options: BackupEngineOptions

  constructor(options: BackupEngineOptions) {
    super()
    this.options = options
  }

  hydrateTasks(tasks: BackupTask[]): void {
    this.tasks.clear()
    for (const task of tasks) {
      const hydratedMetadata = normalizeMetadata(task.metadata)
      const status =
        task.status === 'running' || task.status === 'verifying' ? 'failed' : task.status
      const hydrated: BackupTask = {
        ...task,
        metadata: hydratedMetadata,
        status,
        updatedAt: now(),
        errorMessage:
          task.status === 'running' || task.status === 'verifying'
            ? '应用在任务执行期间退出，任务已标记为失败。'
            : task.errorMessage,
        verificationLines: task.verificationLines ?? [],
        summary: buildSummary(
          task.destinations,
          task.summary?.directoryCount ?? 0,
          task.summary?.verificationCompletedFiles ?? 0
        )
      }
      this.tasks.set(hydrated.id, hydrated)
    }
  }

  createTask(config: TaskConfig, resolveLogFilePath: (taskId: string) => string): BackupTask {
    this.validateTaskConfig(config)

    const createdAt = now()
    const metadata = normalizeMetadata(config.metadata)
    const sourcePath = path.resolve(config.sourcePath)
    const sourceRootName = path.basename(sourcePath)
    const destinations = config.destinationPaths.map((destinationPath, index) => {
      const basePath = path.resolve(destinationPath)
      return this.createDestination(basePath, config.namingTemplate, config.name.trim(), sourceRootName, metadata, index)
    })

    const task: BackupTask = {
      id: uuidv4(),
      name: config.name.trim(),
      sourcePath,
      sourceRootName,
      destinations,
      hashAlgorithm: config.hashAlgorithm,
      namingTemplate: config.namingTemplate,
      metadata,
      verifyAfterCopy: config.verifyAfterCopy,
      status: 'pending',
      totalFiles: 0,
      completedFiles: 0,
      totalBytes: 0,
      transferredBytes: 0,
      speedBps: 0,
      eta: 0,
      currentFile: '',
      createdAt,
      updatedAt: createdAt,
      logFilePath: '',
      summary: buildSummary(destinations, 0, 0),
      verificationLines: [],
      fileRecords: []
    }

    task.logFilePath = resolveLogFilePath(task.id)
    this.tasks.set(task.id, task)
    return task
  }

  getTask(taskId: string): BackupTask | undefined {
    return this.tasks.get(taskId)
  }

  getAllTasks(): BackupTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  deleteTask(taskId: string): BackupTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined
    this.tasks.delete(taskId)
    this.cancelFlags.delete(taskId)
    return task
  }

  cancelTask(taskId: string): void {
    this.cancelFlags.set(taskId, true)
    const task = this.tasks.get(taskId)
    if (!task) return
    void this.log(task.id, '收到取消请求。')
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    if (task.status === 'running' || task.status === 'verifying') {
      throw new Error('任务已在运行中。')
    }

    this.resetTaskForRun(task)
    await this.log(task.id, `开始任务：${task.name}`)
    await this.log(
      task.id,
      `配置：源 ${task.sourcePath}，目标 ${task.destinations.map((destination) => destination.resolvedPath).join('；')}`
    )

    try {
      const enumeration = await this.enumerateFiles(task.sourcePath)
      task.totalFiles = enumeration.files.length
      task.totalBytes = enumeration.files.reduce((sum, file) => sum + file.size, 0)
      task.summary = buildSummary(task.destinations, enumeration.directoryCount, 0)
      this.touchTask(task)
      this.emitProgress(task)

      if (enumeration.files.length === 0) {
        throw new Error('源目录为空，没有可备份的文件。')
      }

      await this.runPreflightChecks(task)

      let speedSamples: number[] = []
      let lastBytes = 0
      let lastTime = now()

      for (const file of enumeration.files) {
        this.ensureNotCancelled(task.id)
        task.currentFile = `拷贝 ${file.relativePath}`
        this.touchTask(task)
        this.emitProgress(task)

        const record = await this.copyFileToAllDestinations(task, file, (bytesWritten) => {
          task.transferredBytes += bytesWritten
          const currentTime = now()
          const elapsed = (currentTime - lastTime) / 1000
          if (elapsed >= 0.5) {
            const currentSpeed = (task.transferredBytes - lastBytes) / elapsed
            speedSamples.push(currentSpeed)
            if (speedSamples.length > 5) speedSamples.shift()
            task.speedBps = speedSamples.reduce((sum, sample) => sum + sample, 0) / speedSamples.length
            lastBytes = task.transferredBytes
            lastTime = currentTime
            const remaining = task.totalBytes - task.transferredBytes
            task.eta = task.speedBps > 0 ? remaining / task.speedBps : 0
            this.touchTask(task)
            this.emitProgress(task)
          }
        })

        task.fileRecords.push(record)
        task.completedFiles++
        this.touchTask(task)
        this.emitProgress(task)
      }

      task.speedBps = 0
      task.eta = 0
      task.currentFile = ''
      this.touchTask(task)
      this.emitProgress(task)

      if (task.verifyAfterCopy) {
        await this.verifyTask(task)
      } else {
        task.destinations = task.destinations.map((destination) => ({
          ...destination,
          verified: false,
          verificationStatus: 'skipped',
          error: undefined
        }))
        task.summary = buildSummary(task.destinations, task.summary.directoryCount, 0)
      }

      task.status = 'completed'
      task.completedAt = now()
      task.currentFile = ''
      this.touchTask(task)
      this.emitProgress(task)
      await this.log(task.id, '任务完成。')
    } catch (error) {
      if ((error as Error).name === CANCELLED_ERROR || (error as Error).message === CANCELLED_ERROR) {
        task.status = 'cancelled'
        task.completedAt = now()
        task.currentFile = ''
        task.speedBps = 0
        task.eta = 0
        task.errorMessage = '任务已取消。'
        this.touchTask(task)
        this.emitProgress(task)
        await this.log(task.id, '任务已取消。')
        return
      }

      task.status = 'failed'
      task.completedAt = now()
      task.currentFile = ''
      task.speedBps = 0
      task.eta = 0
      task.errorMessage = (error as Error).message
      this.touchTask(task)
      this.emitProgress(task)
      await this.log(task.id, `任务失败：${task.errorMessage}`)
      throw error
    }
  }

  private validateTaskConfig(config: TaskConfig): void {
    if (!config.name.trim()) throw new Error('任务名称不能为空。')
    if (!config.sourcePath.trim()) throw new Error('请选择素材源目录。')
    if (!config.destinationPaths.length) throw new Error('至少需要一个备份目的地。')

    const metadata = normalizeMetadata(config.metadata)
    if (!metadata.projectName.trim()) throw new Error('请选择或填写项目名。')
    if (!metadata.projectDeviceNames.length) throw new Error('请至少选择一个项目设备。')
    if (!metadata.currentDevice.trim()) throw new Error('请为本次素材选择归属机位。')

    const sourcePath = path.resolve(config.sourcePath)
    const destinationPaths = config.destinationPaths.map((item) => path.resolve(item))
    const uniqueDestinations = new Set(destinationPaths)

    if (uniqueDestinations.size !== destinationPaths.length) {
      throw new Error('存在重复的备份目的地，请保留唯一目录。')
    }

    for (const destinationPath of destinationPaths) {
      if (destinationPath === sourcePath) {
        throw new Error('备份目的地不能与素材源相同。')
      }

      if (isSubPath(sourcePath, destinationPath) || isSubPath(destinationPath, sourcePath)) {
        throw new Error('素材源与备份目的地不能互相包含。')
      }
    }
  }

  private createDestination(
    basePath: string,
    namingTemplate: string,
    taskName: string,
    sourceRootName: string,
    metadata: TaskMetadata,
    index: number
  ): Destination {
    const dateRootPath = path.join(basePath, metadata.shootDateCompact)
    const currentDeviceRootPath = path.join(dateRootPath, sanitizePathSegment(metadata.currentDevice))
    const templatePath = this.resolveTemplatePath(namingTemplate, taskName, sourceRootName, metadata)
    const resolvedPath = templatePath ? path.join(currentDeviceRootPath, templatePath) : currentDeviceRootPath

    return {
      id: uuidv4(),
      label: `备份 ${index + 1}`,
      basePath,
      resolvedPath,
      verified: false,
      verificationStatus: 'pending',
      bytesWritten: 0
    }
  }

  private resolveTemplatePath(
    namingTemplate: string,
    taskName: string,
    sourceRootName: string,
    metadata: TaskMetadata
  ): string {
    if (namingTemplate === '{原始结构}') return ''

    const tokens: Record<string, string> = {
      '{YYYY-MM-DD}': metadata.shootDate,
      '{日期}': metadata.shootDate,
      '{卷号}': metadata.rollName,
      '{时间}': metadata.timeStampCompact,
      '{机位}': metadata.currentDevice,
      '{项目名}': metadata.projectName || taskName,
      '{任务名}': taskName,
      '{素材名}': sourceRootName,
      '{原始结构}': ''
    }

    return namingTemplate
      .split('/')
      .map((segment) => {
        const renderedSegment = Object.entries(tokens).reduce(
          (result, [token, value]) => result.replaceAll(token, sanitizePathSegment(value)),
          segment
        )
        return sanitizePathSegment(renderedSegment)
      })
      .filter(Boolean)
      .join(path.sep)
  }

  private resetTaskForRun(task: BackupTask): void {
    const currentTime = now()
    this.cancelFlags.set(task.id, false)
    task.status = 'running'
    task.startedAt = currentTime
    task.completedAt = undefined
    task.updatedAt = currentTime
    task.totalFiles = 0
    task.completedFiles = 0
    task.totalBytes = 0
    task.transferredBytes = 0
    task.speedBps = 0
    task.eta = 0
    task.currentFile = ''
    task.errorMessage = undefined
    task.fileRecords = []
    task.verificationLines = []
    task.destinations = task.destinations.map((destination) => ({
      ...destination,
      verified: false,
      verificationStatus: task.verifyAfterCopy ? 'pending' : 'skipped',
      bytesWritten: 0,
      freeBytesAtStart: undefined,
      error: undefined
    }))
    task.summary = buildSummary(task.destinations, 0, 0)
  }

  private async runPreflightChecks(task: BackupTask): Promise<void> {
    const sourceStat = await fs.promises.stat(task.sourcePath)
    if (!sourceStat.isDirectory()) {
      throw new Error('素材源不是有效目录。')
    }

    for (const destination of task.destinations) {
      const dateRootPath = path.join(destination.basePath, task.metadata.shootDateCompact)
      await fs.promises.mkdir(dateRootPath, { recursive: true })

      for (const deviceName of task.metadata.projectDeviceNames) {
        await fs.promises.mkdir(path.join(dateRootPath, sanitizePathSegment(deviceName)), { recursive: true })
      }

      await fs.promises.mkdir(destination.resolvedPath, { recursive: true })
      const driveInfo = await this.options.getDriveInfo(destination.resolvedPath)
      if (!driveInfo) {
        throw new Error(`无法读取目标盘空间信息：${destination.basePath}`)
      }

      destination.freeBytesAtStart = driveInfo.free
      if (driveInfo.free < task.totalBytes) {
        throw new Error(
          `${destination.label} 空间不足，需要 ${(task.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB，可用 ${(driveInfo.free / 1024 / 1024 / 1024).toFixed(2)} GB。`
        )
      }
    }
  }

  private async copyFileToAllDestinations(
    task: BackupTask,
    file: EnumeratedFile,
    onProgress: (bytes: number) => void
  ): Promise<FileRecord> {
    const destinationResults: DestinationRecord[] = []

    for (const destination of task.destinations) {
      this.ensureNotCancelled(task.id)
      const destinationFilePath = path.join(destination.resolvedPath, file.relativePath)
      await fs.promises.mkdir(path.dirname(destinationFilePath), { recursive: true })

      await this.copyFile(
        file.absolutePath,
        destinationFilePath,
        (bytes) => {
          destination.bytesWritten += bytes
          onProgress(bytes / task.destinations.length)
        },
        () => this.ensureNotCancelled(task.id)
      )

      destinationResults.push({
        destinationId: destination.id,
        path: destinationFilePath,
        verified: false,
        verificationStatus: task.verifyAfterCopy ? 'pending' : 'skipped'
      })
    }

    return {
      name: file.name,
      relativePath: file.relativePath,
      size: file.size,
      destinations: destinationResults
    }
  }

  private async verifyTask(task: BackupTask): Promise<void> {
    task.status = 'verifying'
    task.currentFile = '正在进行真实校验'
    task.summary = buildSummary(task.destinations, task.summary.directoryCount, 0)
    this.touchTask(task)
    this.emitProgress(task)
    await this.log(task.id, '开始真实校验。')

    for (const record of task.fileRecords) {
      this.ensureNotCancelled(task.id)
      task.currentFile = `校验 ${record.relativePath}`
      this.touchTask(task)
      this.emitProgress(task)

      const sourceFilePath = path.join(task.sourcePath, record.relativePath)
      record.srcChecksum = await this.hashFile(sourceFilePath, task.hashAlgorithm, () => this.ensureNotCancelled(task.id))
      this.pushVerificationLine(task, `源文件 ${record.name} 校验完成`)

      for (const destinationRecord of record.destinations) {
        const destination = task.destinations.find((item) => item.id === destinationRecord.destinationId)
        if (!destination) continue

        destinationRecord.checksum = await this.hashFile(
          destinationRecord.path,
          task.hashAlgorithm,
          () => this.ensureNotCancelled(task.id)
        )
        destinationRecord.verified = destinationRecord.checksum === record.srcChecksum
        destinationRecord.verificationStatus = destinationRecord.verified ? 'verified' : 'failed'
        destinationRecord.error = destinationRecord.verified ? undefined : `校验失败：${record.relativePath}`

        if (!destinationRecord.verified) {
          destination.verificationStatus = 'failed'
          destination.error = destinationRecord.error
        }

        this.pushVerificationLine(
          task,
          `${destination.label} / ${path.basename(record.relativePath)} ${destinationRecord.verified ? '通过' : '失败'}`
        )
      }

      task.summary = buildSummary(task.destinations, task.summary.directoryCount, task.summary.verificationCompletedFiles + 1)
      this.touchTask(task)
      this.emitProgress(task)
    }

    this.finalizeDestinations(task)
    await this.log(
      task.id,
      `校验完成：${task.summary.verificationCompletedFiles}/${task.totalFiles} 个文件，${task.summary.failedDestinations} 个目标盘失败。`
    )

    if (task.destinations.some((destination) => destination.verificationStatus === 'failed')) {
      throw new Error('真实校验完成，但存在校验失败的目标盘。')
    }
  }

  private finalizeDestinations(task: BackupTask): void {
    task.destinations = task.destinations.map((destination) => {
      if (!task.verifyAfterCopy) {
        return {
          ...destination,
          verified: false,
          verificationStatus: 'skipped',
          error: undefined
        }
      }

      const results = task.fileRecords
        .map((record) => record.destinations.find((item) => item.destinationId === destination.id))
        .filter(Boolean)

      const hasFailure = results.some((item) => item?.verificationStatus === 'failed')
      const allVerified = results.length > 0 && results.every((item) => item?.verificationStatus === 'verified')

      return {
        ...destination,
        verified: allVerified,
        verificationStatus: hasFailure ? 'failed' : allVerified ? 'verified' : 'pending',
        error: hasFailure ? destination.error ?? '目标盘校验失败。' : undefined
      }
    })
    task.summary = buildSummary(task.destinations, task.summary.directoryCount, task.summary.verificationCompletedFiles)
  }

  private copyFile(
    src: string,
    dest: string,
    onProgress: (bytes: number) => void,
    ensureActive: () => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(src, { highWaterMark: 2 * 1024 * 1024 })
      const writeStream = fs.createWriteStream(dest)

      const stop = (error: Error): void => {
        readStream.destroy(error)
        writeStream.destroy(error)
      }

      readStream.on('data', (chunk: Buffer | string) => {
        try {
          ensureActive()
        } catch (error) {
          stop(error as Error)
          return
        }
        onProgress(Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk))
      })

      readStream.on('error', reject)
      writeStream.on('error', reject)
      writeStream.on('finish', resolve)
      readStream.pipe(writeStream)
    })
  }

  private hashFile(filePath: string, algorithm: TaskConfig['hashAlgorithm'], ensureActive: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm)
      const stream = fs.createReadStream(filePath, { highWaterMark: 2 * 1024 * 1024 })

      stream.on('data', (chunk) => {
        try {
          ensureActive()
        } catch (error) {
          stream.destroy(error as Error)
          return
        }
        hash.update(chunk)
      })

      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private async enumerateFiles(dirPath: string, baseDir?: string): Promise<EnumerationResult> {
    const base = baseDir ?? dirPath
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files: EnumeratedFile[] = []
    let directoryCount = 0

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        directoryCount++
        const nested = await this.enumerateFiles(fullPath, base)
        directoryCount += nested.directoryCount
        files.push(...nested.files)
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath)
        files.push({
          name: entry.name,
          relativePath: path.relative(base, fullPath),
          size: stat.size,
          absolutePath: fullPath
        })
      }
    }

    return { files, directoryCount }
  }

  private pushVerificationLine(task: BackupTask, message: string): void {
    task.verificationLines = [...task.verificationLines.slice(-2), message]
    this.touchTask(task)
    this.emitProgress(task)
  }

  private ensureNotCancelled(taskId: string): void {
    if (this.cancelFlags.get(taskId)) throw createCancelledError()
  }

  private async log(taskId: string, message: string): Promise<void> {
    await this.options.appendTaskLog(taskId, message)
  }

  private touchTask(task: BackupTask): void {
    task.updatedAt = now()
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
      destinations: task.destinations,
      errorMessage: task.errorMessage,
      summary: task.summary,
      verificationLines: task.verificationLines
    }
    this.emit('progress', payload)
  }
}
