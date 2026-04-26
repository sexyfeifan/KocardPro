import { contextBridge, ipcRenderer } from 'electron'
import type { TaskConfig, ProgressPayload, ProjectConfig } from './types'

interface AppSettings {
  defaultHash: 'md5' | 'sha1' | 'sha256'
  verifyAfterCopy: boolean
  devices: string[]
}

contextBridge.exposeInMainWorld('api', {
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  saveReport: (taskName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveReport', taskName),

  createTask: (config: TaskConfig) =>
    ipcRenderer.invoke('backup:createTask', config),

  startTask: (taskId: string) =>
    ipcRenderer.invoke('backup:startTask', taskId),

  cancelTask: (taskId: string) =>
    ipcRenderer.invoke('backup:cancelTask', taskId),

  deleteTask: (taskId: string) =>
    ipcRenderer.invoke('backup:deleteTask', taskId),

  getTasks: () =>
    ipcRenderer.invoke('backup:getTasks'),

  getTask: (taskId: string) =>
    ipcRenderer.invoke('backup:getTask', taskId),

  generateReport: (taskId: string, savePath: string) =>
    ipcRenderer.invoke('backup:generateReport', taskId, savePath),

  getDriveInfo: (dirPath: string) =>
    ipcRenderer.invoke('system:getDriveInfo', dirPath),

  getSystemInfo: () =>
    ipcRenderer.invoke('system:getInfo'),

  revealInFinder: (filePath: string) =>
    ipcRenderer.invoke('system:revealInFinder', filePath),

  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings: AppSettings): Promise<boolean> =>
    ipcRenderer.invoke('settings:save', settings),

  getDevices: (): Promise<string[]> =>
    ipcRenderer.invoke('settings:getDevices'),

  addDevice: (name: string): Promise<string[]> =>
    ipcRenderer.invoke('settings:addDevice', name),

  removeDevice: (name: string): Promise<string[]> =>
    ipcRenderer.invoke('settings:removeDevice', name),

  getProjects: (): Promise<ProjectConfig[]> =>
    ipcRenderer.invoke('projects:getAll'),

  saveProject: (project: ProjectConfig): Promise<ProjectConfig[]> =>
    ipcRenderer.invoke('projects:save', project),

  deleteProject: (projectId: string): Promise<ProjectConfig[]> =>
    ipcRenderer.invoke('projects:delete', projectId),

  onProgress: (callback: (payload: ProgressPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ProgressPayload) => callback(payload)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  }
})
