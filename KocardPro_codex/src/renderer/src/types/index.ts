export * from '../../../shared/types'

declare global {
  interface Window {
    api: {
      selectDirectory: () => Promise<string | null>
      saveReport: (taskName: string) => Promise<string | null>
      createTask: (config: TaskConfig) => Promise<BackupTask>
      startTask: (taskId: string) => Promise<boolean>
      cancelTask: (taskId: string) => Promise<boolean>
      deleteTask: (taskId: string) => Promise<boolean>
      getTasks: () => Promise<BackupTask[]>
      getTask: (taskId: string) => Promise<BackupTask | undefined>
      generateReport: (taskId: string, savePath: string) => Promise<boolean>
      getDriveInfo: (dirPath: string) => Promise<DriveInfo | null>
      getSystemInfo: () => Promise<SystemInfo>
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<AppSettings>
      openTaskLog: (taskId: string) => Promise<boolean>
      revealInFinder: (filePath: string) => Promise<void>
      onProgress: (callback: (payload: ProgressPayload) => void) => () => void
    }
  }
}
