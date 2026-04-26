import electron from 'electron'
const { contextBridge, ipcRenderer } = electron
import type { AppSettings, ProgressPayload, TaskConfig } from './types'

contextBridge.exposeInMainWorld('api', {
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectDirectory'),

  saveReport: (taskName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveReport', taskName),

  createTask: (config: TaskConfig) => ipcRenderer.invoke('backup:createTask', config),

  startTask: (taskId: string) => ipcRenderer.invoke('backup:startTask', taskId),

  cancelTask: (taskId: string) => ipcRenderer.invoke('backup:cancelTask', taskId),

  deleteTask: (taskId: string) => ipcRenderer.invoke('backup:deleteTask', taskId),

  getTasks: () => ipcRenderer.invoke('backup:getTasks'),

  getTask: (taskId: string) => ipcRenderer.invoke('backup:getTask', taskId),

  generateReport: (taskId: string, savePath: string) =>
    ipcRenderer.invoke('backup:generateReport', taskId, savePath),

  getDriveInfo: (dirPath: string) => ipcRenderer.invoke('system:getDriveInfo', dirPath),

  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  saveSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:save', settings),

  revealInFinder: (filePath: string) => ipcRenderer.invoke('system:revealInFinder', filePath),

  openTaskLog: (taskId: string) => ipcRenderer.invoke('backup:openTaskLog', taskId),

  onProgress: (callback: (payload: ProgressPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ProgressPayload) => callback(payload)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  }
})
