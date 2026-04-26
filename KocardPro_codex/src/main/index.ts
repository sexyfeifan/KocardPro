import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')

import * as fs from 'fs'
import { join } from 'path'
import * as os from 'os'
import { BackupEngine, buildProjectPresetFromTask } from './backup/BackupEngine'
import { generateReport } from './backup/ReportGenerator'
import { AppPersistence } from './persistence/AppPersistence'
import type { AppSettings, ProjectPreset, TaskConfig } from './types'

let mainWindow: Electron.BrowserWindow | null = null
let persistence: AppPersistence
let backupEngine: BackupEngine
let settings: AppSettings

function createWindow(): void {
  const isDev = !app.isPackaged
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1160,
    minHeight: 720,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error('[renderer] did-fail-load', { errorCode, errorDescription, validatedURL })
  })
  win.webContents.on('render-process-gone', (_, details) => {
    console.error('[renderer] render-process-gone', details)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
}

function persistTasks(taskId: string): void {
  const task = backupEngine.getTask(taskId)
  if (!task) return
  persistence.saveTasks(backupEngine.getAllTasks()).catch(console.error)
}

function upsertProjectPreset(preset: ProjectPreset): void {
  if (!preset.name.trim()) return
  const existing = settings.projectPresets.find((item) => item.name === preset.name)
  const nextProjectPresets = existing
    ? settings.projectPresets.map((item) => (item.name === preset.name ? { ...preset, id: existing.id } : item))
    : [preset, ...settings.projectPresets]

  settings = {
    ...settings,
    projectPresets: nextProjectPresets.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

async function registerIpcHandlers(): Promise<void> {
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
    const normalizedConfig: TaskConfig = {
      ...config,
      hashAlgorithm: config.hashAlgorithm ?? settings.defaultHashAlgorithm,
      namingTemplate: config.namingTemplate || settings.defaultNamingTemplate,
      verifyAfterCopy:
        typeof config.verifyAfterCopy === 'boolean' ? config.verifyAfterCopy : settings.verifyAfterCopy
    }
    upsertProjectPreset(buildProjectPresetFromTask(normalizedConfig))
    await persistence.saveSettings(settings)

    const task = backupEngine.createTask(
      normalizedConfig,
      (taskId) => persistence.getLogFilePath(taskId)
    )

    await persistence.saveTasks(backupEngine.getAllTasks())
    await persistence.appendTaskLog(task.id, `创建任务：${task.name}`)
    return task
  })

  ipcMain.handle('backup:startTask', async (_, taskId: string) => {
    backupEngine.startTask(taskId).catch(console.error)
    return true
  })

  ipcMain.handle('backup:cancelTask', async (_, taskId: string) => {
    backupEngine.cancelTask(taskId)
    await persistence.saveTasks(backupEngine.getAllTasks())
    return true
  })

  ipcMain.handle('backup:deleteTask', async (_, taskId: string) => {
    const task = backupEngine.deleteTask(taskId)
    if (task?.logFilePath) {
      await fs.promises.rm(task.logFilePath, { force: true }).catch(() => undefined)
    }
    await persistence.saveTasks(backupEngine.getAllTasks())
    return true
  })

  ipcMain.handle('backup:getTasks', async () => backupEngine.getAllTasks())

  ipcMain.handle('backup:getTask', async (_, taskId: string) => backupEngine.getTask(taskId))

  ipcMain.handle('backup:generateReport', async (_, taskId: string, savePath: string) => {
    const task = backupEngine.getTask(taskId)
    if (!task) throw new Error('Task not found')
    const buffer = await generateReport(task)
    await fs.promises.writeFile(savePath, Buffer.from(buffer))
    if (settings.autoRevealAfterExport) shell.showItemInFolder(savePath)
    await persistence.appendTaskLog(task.id, `导出报告：${savePath}`)
    return true
  })

  ipcMain.handle('backup:openTaskLog', async (_, taskId: string) => {
    const task = backupEngine.getTask(taskId)
    if (!task?.logFilePath) return false
    shell.showItemInFolder(task.logFilePath)
    return true
  })

  ipcMain.handle('settings:get', async () => settings)

  ipcMain.handle('settings:save', async (_, nextSettings: AppSettings) => {
    settings = await persistence.saveSettings(nextSettings)
    return settings
  })

  ipcMain.handle('system:getDriveInfo', async (_, dirPath: string) => {
    try {
      const stat = await (fs.promises as typeof fs.promises & { statfs: (path: string) => Promise<fs.StatFs> }).statfs(
        dirPath
      )
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

  ipcMain.handle('system:getInfo', async () => ({
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem()
  }))

  ipcMain.handle('system:revealInFinder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.kocard.pro.codex')

  persistence = new AppPersistence(app.getPath('userData'))
  await persistence.init()
  settings = await persistence.loadSettings()

  backupEngine = new BackupEngine({
    getDriveInfo: async (dirPath) => {
      try {
        const stat = await (fs.promises as typeof fs.promises & {
          statfs: (path: string) => Promise<fs.StatFs>
        }).statfs(dirPath)
        return {
          path: dirPath,
          total: stat.blocks * stat.bsize,
          free: stat.bfree * stat.bsize,
          used: (stat.blocks - stat.bfree) * stat.bsize
        }
      } catch {
        return null
      }
    },
    appendTaskLog: (taskId, message) => persistence.appendTaskLog(taskId, message)
  })

  const persistedTasks = await persistence.loadTasks()
  backupEngine.hydrateTasks(
    persistedTasks.map((task) => ({
      ...task,
      logFilePath: task.logFilePath || persistence.getLogFilePath(task.id)
    }))
  )
  await persistence.saveTasks(backupEngine.getAllTasks())

  backupEngine.on('progress', (payload) => {
    if (mainWindow) {
      mainWindow.webContents.send('backup:progress', payload)
    }
    persistTasks(payload.taskId)
  })

  await registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
