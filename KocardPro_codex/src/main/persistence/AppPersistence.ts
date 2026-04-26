import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings, BackupTask } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
  defaultHashAlgorithm: 'sha256',
  verifyAfterCopy: true,
  defaultNamingTemplate: '{卷号}_{时间}',
  defaultProjectName: '',
  autoRevealAfterExport: true,
  defaultRollPrefix: 'Untitled',
  deviceCatalog: ['A-Cam', 'B-Cam', 'FX3'],
  projectPresets: []
}

export class AppPersistence {
  private readonly dataDir: string
  private readonly tasksFile: string
  private readonly settingsFile: string
  private readonly logsDir: string

  constructor(baseDir: string) {
    this.dataDir = path.join(baseDir, 'data')
    this.logsDir = path.join(baseDir, 'logs')
    this.tasksFile = path.join(this.dataDir, 'tasks.json')
    this.settingsFile = path.join(this.dataDir, 'settings.json')
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.dataDir, { recursive: true })
    await fs.promises.mkdir(this.logsDir, { recursive: true })
  }

  async loadTasks(): Promise<BackupTask[]> {
    const data = await this.readJsonFile<BackupTask[]>(this.tasksFile, [])
    return Array.isArray(data) ? data : []
  }

  async saveTasks(tasks: BackupTask[]): Promise<void> {
    await this.writeJsonFile(this.tasksFile, tasks)
  }

  async loadSettings(): Promise<AppSettings> {
    const data = await this.readJsonFile<Partial<AppSettings>>(this.settingsFile, {})
    return { ...DEFAULT_SETTINGS, ...data }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const next = { ...DEFAULT_SETTINGS, ...settings }
    await this.writeJsonFile(this.settingsFile, next)
    return next
  }

  getLogFilePath(taskId: string): string {
    return path.join(this.logsDir, `${taskId}.log`)
  }

  async appendTaskLog(taskId: string, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] ${message}\n`
    await fs.promises.appendFile(this.getLogFilePath(taskId), line, 'utf8')
  }

  private async readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8')
      return JSON.parse(content) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
      throw error
    }
  }

  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    const tmpFile = `${filePath}.tmp`
    await fs.promises.writeFile(tmpFile, JSON.stringify(value, null, 2), 'utf8')
    await fs.promises.rename(tmpFile, filePath)
  }
}
