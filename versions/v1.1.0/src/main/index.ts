import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
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
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultHash: 'md5',
  verifyAfterCopy: true,
  devices: ['A机', 'B机', 'C机', 'DIT']
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
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:saveReport', async (_, taskName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${taskName}_备份报告.pdf`,
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
    backupEngine.startTask(taskId).catch(console.error)
    return true
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
              const stat = await (fs.promises as any).statfs(volPath)
              return {
                name: e.name,
                path: volPath,
                total: stat.blocks * stat.bsize,
                free: stat.bfree * stat.bsize,
                used: (stat.blocks - stat.bfree) * stat.bsize
              }
            } catch {
              return null
            }
          })
      )
      return volumes.filter(Boolean)
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
}
