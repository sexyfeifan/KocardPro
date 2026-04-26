export type HashAlgorithm = 'md5' | 'sha1' | 'sha256'
export type TaskStatus = 'pending' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled'

export interface Destination {
  id: string
  path: string
  resolvedPath?: string
  label: string
  verified: boolean
  checksum?: string
  bytesWritten: number
  error?: string
}

export interface FileRecord {
  name: string
  relativePath: string
  size: number
  srcChecksum: string
  destinations: Array<{
    path: string
    checksum: string
    verified: boolean
  }>
}

export interface BackupTask {
  id: string
  name: string
  sourcePath: string
  devices: string[]
  destinations: Destination[]
  hashAlgorithm: HashAlgorithm
  namingTemplate: string
  status: TaskStatus
  totalFiles: number
  completedFiles: number
  totalBytes: number
  transferredBytes: number
  speedBps: number
  eta: number
  currentFile: string
  verifyLog: string[]
  startedAt?: number
  completedAt?: number
  errorMessage?: string
  fileRecords: FileRecord[]
}

export interface TaskConfig {
  name: string
  sourcePath: string
  devices: string[]
  destinationPaths: string[]
  hashAlgorithm: HashAlgorithm
  namingTemplate: string
  shootingDate: string
}

export interface ProgressPayload {
  taskId: string
  status: TaskStatus
  totalFiles: number
  completedFiles: number
  totalBytes: number
  transferredBytes: number
  speedBps: number
  eta: number
  currentFile: string
  verifyLog: string[]
  destinations: Destination[]
  errorMessage?: string
}

export interface AppSettings {
  defaultHash: HashAlgorithm
  verifyAfterCopy: boolean
  devices: string[]
}

export interface ProjectConfig {
  id: string
  name: string
  devices: string[]
  directoryTemplate: string
  volumePrefix: string
}

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
      getDriveInfo: (dirPath: string) => Promise<{ total: number; free: number; used: number } | null>
      getSystemInfo: () => Promise<{ platform: string; arch: string; hostname: string }>
      revealInFinder: (filePath: string) => Promise<void>
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<boolean>
      getDevices: () => Promise<string[]>
      addDevice: (name: string) => Promise<string[]>
      removeDevice: (name: string) => Promise<string[]>
      getProjects: () => Promise<ProjectConfig[]>
      saveProject: (project: ProjectConfig) => Promise<ProjectConfig[]>
      deleteProject: (projectId: string) => Promise<ProjectConfig[]>
      onProgress: (callback: (payload: ProgressPayload) => void) => () => void
    }
  }
}
