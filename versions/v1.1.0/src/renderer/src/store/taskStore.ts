import { create } from 'zustand'
import type { BackupTask, ProgressPayload, ProjectConfig } from '../types'

interface TaskStore {
  tasks: BackupTask[]
  projects: ProjectConfig[]
  devices: string[]
  activePage: string
  setActivePage: (page: string) => void
  setTasks: (tasks: BackupTask[]) => void
  applyProgress: (payload: ProgressPayload) => void
  addTask: (task: BackupTask) => void
  deleteTask: (taskId: string) => Promise<void>
  refreshTasks: () => Promise<void>
  loadProjects: () => Promise<void>
  loadDevices: () => Promise<void>
  setProjects: (projects: ProjectConfig[]) => void
  setDevices: (devices: string[]) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  projects: [],
  devices: [],
  activePage: 'dashboard',

  setActivePage: (page) => set({ activePage: page }),

  setTasks: (tasks) => set({ tasks }),

  setProjects: (projects) => set({ projects }),

  setDevices: (devices) => set({ devices }),

  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),

  deleteTask: async (taskId) => {
    await window.api.deleteTask(taskId)
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }))
  },

  applyProgress: (payload) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === payload.taskId
          ? {
              ...t,
              status: payload.status,
              totalFiles: payload.totalFiles,
              completedFiles: payload.completedFiles,
              totalBytes: payload.totalBytes,
              transferredBytes: payload.transferredBytes,
              speedBps: payload.speedBps,
              eta: payload.eta,
              currentFile: payload.currentFile,
              verifyLog: payload.verifyLog,
              destinations: payload.destinations,
              errorMessage: payload.errorMessage
            }
          : t
      )
    })),

  refreshTasks: async () => {
    const tasks = await window.api.getTasks()
    set({ tasks })
  },

  loadProjects: async () => {
    const projects = await window.api.getProjects()
    set({ projects })
  },

  loadDevices: async () => {
    const devices = await window.api.getDevices()
    set({ devices })
  }
}))
