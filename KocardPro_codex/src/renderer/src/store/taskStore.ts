import { create } from 'zustand'
import type { AppSettings, BackupTask, ProgressPayload } from '../types'

export type AppPage = 'dashboard' | 'new' | 'history' | 'settings'

interface TaskStore {
  tasks: BackupTask[]
  settings: AppSettings | null
  activePage: AppPage
  isBootstrapping: boolean
  setActivePage: (page: AppPage) => void
  setTasks: (tasks: BackupTask[]) => void
  setSettings: (settings: AppSettings) => void
  hydrate: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<AppSettings>
  addTask: (task: BackupTask) => void
  updateTask: (task: BackupTask) => void
  removeTask: (taskId: string) => void
  applyProgress: (payload: ProgressPayload) => void
}

function sortTasks(tasks: BackupTask[]): BackupTask[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt)
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  settings: null,
  activePage: 'dashboard',
  isBootstrapping: true,

  setActivePage: (page) => set({ activePage: page }),

  setTasks: (tasks) => set({ tasks: sortTasks(tasks) }),

  setSettings: (settings) => set({ settings }),

  hydrate: async () => {
    set({ isBootstrapping: true })
    const [tasks, settings] = await Promise.all([window.api.getTasks(), window.api.getSettings()])
    set({
      tasks: sortTasks(tasks),
      settings,
      isBootstrapping: false
    })
  },

  refreshTasks: async () => {
    const tasks = await window.api.getTasks()
    set({ tasks: sortTasks(tasks) })
  },

  refreshSettings: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
  },

  saveSettings: async (settings) => {
    const next = await window.api.saveSettings(settings)
    set({ settings: next })
    return next
  },

  addTask: (task) =>
    set((state) => ({
      tasks: sortTasks([task, ...state.tasks.filter((item) => item.id !== task.id)])
    })),

  updateTask: (task) =>
    set((state) => ({
      tasks: sortTasks(state.tasks.map((item) => (item.id === task.id ? task : item)))
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId)
    })),

  applyProgress: (payload) =>
    set((state) => ({
      tasks: sortTasks(
        state.tasks.map((task) =>
          task.id === payload.taskId
            ? {
                ...task,
                status: payload.status,
                totalFiles: payload.totalFiles,
                completedFiles: payload.completedFiles,
                totalBytes: payload.totalBytes,
                transferredBytes: payload.transferredBytes,
                speedBps: payload.speedBps,
                eta: payload.eta,
                currentFile: payload.currentFile,
                destinations: payload.destinations,
                errorMessage: payload.errorMessage,
                summary: payload.summary,
                verificationLines: payload.verificationLines,
                updatedAt: Date.now()
              }
            : task
        )
      )
    }))
}))
