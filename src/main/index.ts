import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { BackupEngine } from './backup/BackupEngine'
import { generateReport } from './backup/ReportGenerator'
import type { BackupTask, TaskConfig, ProjectConfig } from './types'

const execAsync = promisify(exec)

interface AppSettings {
  defaultHash: 'md5' | 'sha1' | 'sha256'
  verifyAfterCopy: boolean
  devices: string[]
  backupCount: number
  isUnlocked: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultHash: 'md5',
  verifyAfterCopy: true,
  devices: ['A机', 'B机', 'C机', 'DIT'],
  backupCount: 0,
  isUnlocked: false
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function getTasksPath(): string {
  return join(app.getPath('userData'), 'tasks.json')
}

function getProjectsPath(): string {
  return join(app.getPath('userData'), 'projects.json')
}

function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

function loadPersistedTasks(): BackupTask[] {
  try {
    const raw = fs.readFileSync(getTasksPath(), 'utf-8')
    return JSON.parse(raw) as BackupTask[]
  } catch {
    return []
  }
}

function persistTasks(tasks: BackupTask[]): void {
  try {
    fs.writeFileSync(getTasksPath(), JSON.stringify(tasks, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to persist tasks:', e)
  }
}

function loadProjects(): ProjectConfig[] {
  try {
    const raw = fs.readFileSync(getProjectsPath(), 'utf-8')
    return JSON.parse(raw) as ProjectConfig[]
  } catch {
    return []
  }
}

function saveProjects(projects: ProjectConfig[]): void {
  fs.writeFileSync(getProjectsPath(), JSON.stringify(projects, null, 2), 'utf-8')
}

const backupEngine = new BackupEngine()

function createWindow(): void {
  const isDev = !app.isPackaged
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // #4 fix: remove any existing listener before adding new one to prevent accumulation on createWindow() calls
  backupEngine.removeAllListeners('progress')
  backupEngine.on('progress', (payload) => {
    win.webContents.send('backup:progress', payload)
    persistTasks(backupEngine.getAllTasks())
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.kocard.pro')

  const saved = loadPersistedTasks()
  for (const task of saved) {
    if (task.status === 'running' || task.status === 'verifying') {
      task.status = 'failed'
      task.errorMessage = '应用异常退出，任务中断'
    }
    backupEngine.loadTask(task)
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:selectDirectory', async (_, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      ...(defaultPath ? { defaultPath } : {})
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:saveReport', async (_, taskName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `备份报告_${taskName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    return result.filePath ?? null
  })

  ipcMain.handle('backup:createTask', async (_, config: TaskConfig) => {
    const task = backupEngine.createTask(config)
    persistTasks(backupEngine.getAllTasks())
    return task
  })

  ipcMain.handle('backup:startTask', async (_, taskId: string) => {
    const s = loadSettings()
    const FREE_LIMIT = 10
    if (!s.isUnlocked && (s.backupCount ?? 0) >= FREE_LIMIT) {
      return { allowed: false, remaining: 0 }
    }
    if (!s.isUnlocked) {
      s.backupCount = (s.backupCount ?? 0) + 1
      saveSettings(s)
    }
    backupEngine.startTask(taskId).catch(console.error)
    return { allowed: true, remaining: s.isUnlocked ? Infinity : FREE_LIMIT - s.backupCount }
  })

  ipcMain.handle('backup:cancelTask', async (_, taskId: string) => {
    backupEngine.cancelTask(taskId)
    return true
  })

  ipcMain.handle('backup:deleteTask', async (_, taskId: string) => {
    backupEngine.deleteTask(taskId)
    persistTasks(backupEngine.getAllTasks())
    return true
  })

  ipcMain.handle('backup:getTasks', async () => {
    return backupEngine.getAllTasks()
  })

  ipcMain.handle('backup:getTask', async (_, taskId: string) => {
    return backupEngine.getTask(taskId)
  })

  ipcMain.handle('backup:generateReport', async (_, taskId: string, savePath: string) => {
    const task = backupEngine.getTask(taskId)
    if (!task) throw new Error('Task not found')
    const htmlBuffer = generateReport(task)
    const tmpPath = join(app.getPath('temp'), `report_${taskId}.html`)
    await fs.promises.writeFile(tmpPath, htmlBuffer)
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
    await win.loadFile(tmpPath)
    const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    win.destroy()
    await fs.promises.unlink(tmpPath).catch(() => {})
    await fs.promises.writeFile(savePath, Buffer.from(pdfBuffer))
    return true
  })

  ipcMain.handle('system:getDriveInfo', async (_, dirPath: string) => {
    try {
      const stat = await (fs.promises as any).statfs(dirPath)
      return {
        path: dirPath,
        total: stat.blocks * stat.bsize,
        free: stat.bfree * stat.bsize,
        used: (stat.blocks - stat.bfree) * stat.bsize
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('system:getInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem()
    }
  })

  ipcMain.handle('system:revealInFinder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('system:listVolumes', async () => {
    if (process.platform !== 'darwin') return []
    try {
      const entries = await fs.promises.readdir('/Volumes', { withFileTypes: true })
      const volumes = await Promise.all(
        entries
          .filter((e) => !e.name.startsWith('.'))
          .map(async (e) => {
            const volPath = `/Volumes/${e.name}`
            try {
              const { stdout } = await execAsync(`diskutil info "${volPath}" 2>/dev/null || true`)
              const isExternalSignal =
                /Device Location:\s+External/i.test(stdout) ||
                /Protocol:\s+(USB|Thunderbolt|SD Card)/i.test(stdout)
              const hasExplicitInternalSignal =
                /Protocol:\s+Apple Fabric/i.test(stdout) ||
                /Protocol:\s+PCI-Express/i.test(stdout) ||
                /Device Location:\s+Internal/i.test(stdout)
              // Only skip if explicitly internal — card readers often show no external signal
              // but should not be silently dropped
              const isInternal = !isExternalSignal && hasExplicitInternalSignal
              const isRootLink = await fs.promises.realpath(volPath).then((r) => r === '/').catch(() => false)

              // Filter out Time Machine snapshot/backup volumes
              const isTimeMachine =
                e.name.startsWith('com.apple.TimeMachine') ||
                /time[\s-]*machine/i.test(e.name) ||
                /的备份$/.test(e.name)
              if (isTimeMachine) return null

              // Macintosh HD (the root volume symlink) → return as system disk
              if (isRootLink) {
                const stat = await (fs.promises as any).statfs('/').catch(() => null)
                if (!stat) return null
                return {
                  name: 'Macintosh HD',
                  path: '/',
                  total: stat.blocks * stat.bsize,
                  free: stat.bfree * stat.bsize,
                  used: (stat.blocks - stat.bfree) * stat.bsize,
                  deviceType: 'system' as const,
                  canEject: false
                }
              }

              // Skip other internal volumes (Recovery, Preboot, etc.)
              if (isInternal) return null

              const stat = await (fs.promises as any).statfs(volPath)
              const total: number = stat.blocks * stat.bsize
              const free: number = stat.bfree * stat.bsize
              const used: number = (stat.blocks - stat.bfree) * stat.bsize

              // Multi-signal scoring model to distinguish camera cards (source) from backup drives (destination).
              // Positive score = source, negative = destination. Threshold: >= 2 → source.
              const fsType = stdout.match(/Type \(Bundle\):\s+(.+)/i)?.[1]?.trim() ?? ''
              const protocol = stdout.match(/Protocol:\s+(.+)/i)?.[1]?.trim() ?? ''
              const blockSize = parseInt(stdout.match(/Device Block Size:\s+(\d+)/i)?.[1] ?? '0', 10)
              const partScheme = stdout.match(/Partition Type:\s+(.+)/i)?.[1]?.trim() ?? ''
              const isRemovable = /Removable Media:\s+Removable/i.test(stdout)
              const volNameLower = e.name.toLowerCase()

              let score = 0

              // Protocol — strongest signal
              if (/SD Card/i.test(protocol)) score += 5          // definitely a card
              if (/PCI-Express/i.test(protocol)) score += 3       // CFexpress/XQD via PCIe reader
              if (/Thunderbolt/i.test(protocol)) score -= 3       // usually a backup drive; SxS also uses TB but name patterns catch it
              if (/USB/i.test(protocol)) score -= 1               // slight destination lean

              // File system
              if (/exfat|msdos|fat32/i.test(fsType)) score += 2  // card-typical format
              if (/apfs/i.test(fsType)) score -= 2                // macOS-formatted backup drive
              if (/ntfs/i.test(fsType)) score -= 1                // Windows backup drive

              // Block size: 512 = card/reader, 4096 = modern HDD/SSD
              if (blockSize === 512) score += 1
              if (blockSize === 4096) score -= 2

              // Partition scheme: FDisk = camera-formatted card, GUID = Mac-formatted drive
              if (/FDisk/i.test(partScheme)) score += 2
              if (/GUID/i.test(partScheme) || /Apple_partition/i.test(partScheme)) score -= 1

              // Capacity: cards rarely exceed 512 GB today
              if (total <= 512 * 1024 * 1024 * 1024) score += 1
              if (total > 1024 * 1024 * 1024 * 1024) score -= 3  // > 1 TB → almost certainly a drive

              // Removable flag (unreliable on modern readers, but counts a little when present)
              if (isRemovable) score += 1

              // Volume name patterns common on camera cards (SD, CF, CFexpress, CFast, XQD, SxS)
              if (/^[A-Z]\d{3}$/.test(e.name) || // A001, B002
                  /^(CARD|SD|CF|XQD|SXS|CFAST|CFEXPRESS|A7|SONY|CANON|NIKON|FUJI|PANA)/i.test(volNameLower) ||
                  /_(A|B|C|CAM)\d*$/i.test(volNameLower)) score += 2

              // DCIM directory presence is a strong camera-card signal
              const hasDCIM = await fs.promises.access(path.join(volPath, 'DCIM')).then(() => true).catch(() => false)
              if (hasDCIM) score += 3

              const deviceType = score >= 2 ? ('source' as const) : ('destination' as const)

              return { name: e.name, path: volPath, total, free, used, deviceType, canEject: true, _fsType: fsType }
            } catch {
              return null
            }
          })
      )
      return volumes.filter(Boolean).map(({ _fsType: _, ...v }) => v)
    } catch {
      return []
    }
  })

  ipcMain.handle('system:ejectVolume', async (_, volumePath: string) => {
    try {
      await execAsync(`diskutil eject "${volumePath}"`)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('settings:get', async () => loadSettings())

  ipcMain.handle('app:getVersion', async () => app.getVersion())

  ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
    saveSettings(settings)
    return true
  })

  ipcMain.handle('settings:getDevices', async () => {
    return loadSettings().devices
  })

  ipcMain.handle('settings:addDevice', async (_, name: string) => {
    const s = loadSettings()
    if (!s.devices.includes(name)) {
      s.devices.push(name)
      saveSettings(s)
    }
    return s.devices
  })

  ipcMain.handle('settings:removeDevice', async (_, name: string) => {
    const s = loadSettings()
    s.devices = s.devices.filter((d) => d !== name)
    saveSettings(s)
    return s.devices
  })

  ipcMain.handle('settings:renameDevice', async (_, oldName: string, newName: string) => {
    const s = loadSettings()
    const idx = s.devices.indexOf(oldName)
    if (idx >= 0) s.devices[idx] = newName
    saveSettings(s)
    return s.devices
  })

  ipcMain.handle('projects:getAll', async () => loadProjects())

  ipcMain.handle('projects:save', async (_, project: ProjectConfig) => {
    const projects = loadProjects()
    const idx = projects.findIndex((p) => p.id === project.id)
    if (idx >= 0) {
      projects[idx] = project
    } else {
      projects.push(project)
    }
    saveProjects(projects)
    return projects
  })

  ipcMain.handle('projects:delete', async (_, projectId: string) => {
    const projects = loadProjects().filter((p) => p.id !== projectId)
    saveProjects(projects)
    return projects
  })

  ipcMain.handle('projects:createFileStructure', async (_, projectId: string) => {
    const project = loadProjects().find((p) => p.id === projectId)
    if (!project || !project.destinationPaths?.length) {
      return { created: [], skipped: [], errors: ['项目不存在或未设置目的地'] }
    }

    const start = project.shootingDateStart ?? project.shootingDate
    const end = project.shootingDateEnd ?? project.shootingDate
    if (!start || !end) return { created: [], skipped: [], errors: ['未设置拍摄计划日期'] }

    // Enumerate all dates in range
    const dates: string[] = []
    const cur = new Date(start)
    const last = new Date(end)
    while (cur <= last) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      dates.push(`${y}${m}${d}`)
      cur.setDate(cur.getDate() + 1)
    }

    const projectNameCompact = start.replace(/-/g, '') + (project.name ?? '')
    const created: string[] = []
    const skipped: string[] = []
    const errors: string[] = []

    for (const destRoot of project.destinationPaths) {
      for (const dateStr of dates) {
        const dateFolder = join(destRoot, projectNameCompact, dateStr)
        for (const device of project.devices) {
          const positions = project.devicePositions?.[device] ?? []
          if (positions.length === 0) {
            // No sub-positions: just device folder
            const target = join(dateFolder, device)
            try {
              await fs.promises.mkdir(target, { recursive: true })
              created.push(target)
            } catch (e: any) {
              if (e.code === 'EEXIST') skipped.push(target)
              else errors.push(`${target}: ${e.message}`)
            }
          } else {
            for (const pos of positions) {
              const target = join(dateFolder, device, pos)
              try {
                await fs.promises.mkdir(target, { recursive: true })
                created.push(target)
              } catch (e: any) {
                if (e.code === 'EEXIST') skipped.push(target)
                else errors.push(`${target}: ${e.message}`)
              }
            }
          }
        }
      }
    }

    return { created, skipped, errors }
  })

  ipcMain.handle('projects:resolveBackupPath', async (_, params: {
    projectId: string
    shootingDate: string
    deviceName: string
    positionLabel: string
  }) => {
    const { projectId, shootingDate, deviceName, positionLabel } = params
    const project = loadProjects().find((p) => p.id === projectId)
    if (!project || !project.destinationPaths?.length) return null

    const dateStr = shootingDate.replace(/-/g, '')
    const startStr = (project.shootingDateStart ?? project.shootingDate ?? shootingDate).replace(/-/g, '')
    const projectNameCompact = startStr + (project.name ?? '')
    const dest = project.destinationPaths[0]
    const deviceFolder = positionLabel
      ? join(dest, projectNameCompact, dateStr, deviceName, positionLabel)
      : join(dest, projectNameCompact, dateStr, deviceName)
    return deviceFolder
  })

  ipcMain.handle('settings:checkAndIncrementBackupCount', async () => {
    const s = loadSettings()
    if (s.isUnlocked) return { allowed: true, remaining: Infinity }
    const FREE_LIMIT = 10
    if (s.backupCount >= FREE_LIMIT) return { allowed: false, remaining: 0 }
    s.backupCount = (s.backupCount ?? 0) + 1
    saveSettings(s)
    return { allowed: true, remaining: FREE_LIMIT - s.backupCount }
  })

  ipcMain.handle('settings:unlock', async () => {
    const s = loadSettings()
    s.isUnlocked = true
    saveSettings(s)
    return true
  })
}
