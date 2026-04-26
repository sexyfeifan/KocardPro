export type HashAlgorithm = 'md5' | 'sha1' | 'sha256'
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'skipped'

export interface ProjectPreset {
  id: string
  name: string
  deviceNames: string[]
  hashAlgorithm: HashAlgorithm
  namingTemplate: string
  verifyAfterCopy: boolean
  updatedAt: number
}

export interface TaskMetadata {
  projectName: string
  projectPresetId?: string
  projectDeviceNames: string[]
  currentDevice: string
  shootDate: string
  shootDateCompact: string
  rollName: string
  timeStampCompact: string
}

export interface DestinationRecord {
  destinationId: string
  path: string
  checksum?: string
  verified: boolean
  verificationStatus: VerificationStatus
  error?: string
}

export interface FileRecord {
  name: string
  relativePath: string
  size: number
  srcChecksum?: string
  destinations: DestinationRecord[]
}

export interface Destination {
  id: string
  label: string
  basePath: string
  resolvedPath: string
  verified: boolean
  verificationStatus: VerificationStatus
  bytesWritten: number
  freeBytesAtStart?: number
  error?: string
}

export interface TaskSummary {
  directoryCount: number
  failedDestinations: number
  verifiedDestinations: number
  verificationCompletedFiles: number
}

export interface BackupTask {
  id: string
  name: string
  sourcePath: string
  sourceRootName: string
  destinations: Destination[]
  hashAlgorithm: HashAlgorithm
  namingTemplate: string
  metadata: TaskMetadata
  verifyAfterCopy: boolean
  status: TaskStatus
  totalFiles: number
  completedFiles: number
  totalBytes: number
  transferredBytes: number
  speedBps: number
  eta: number
  currentFile: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  errorMessage?: string
  logFilePath?: string
  summary: TaskSummary
  verificationLines: string[]
  fileRecords: FileRecord[]
}

export interface TaskConfig {
  name: string
  sourcePath: string
  destinationPaths: string[]
  hashAlgorithm: HashAlgorithm
  namingTemplate: string
  metadata: TaskMetadata
  verifyAfterCopy: boolean
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
  destinations: Destination[]
  errorMessage?: string
  summary: TaskSummary
  verificationLines: string[]
}

export interface DriveInfo {
  path: string
  total: number
  free: number
  used: number
}

export interface AppSettings {
  defaultHashAlgorithm: HashAlgorithm
  verifyAfterCopy: boolean
  defaultNamingTemplate: string
  defaultProjectName: string
  autoRevealAfterExport: boolean
  defaultRollPrefix: string
  deviceCatalog: string[]
  projectPresets: ProjectPreset[]
}

export interface SystemInfo {
  platform: string
  arch: string
  hostname: string
  cpus: number
  totalMemory: number
}
