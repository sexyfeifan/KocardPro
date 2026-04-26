import { useEffect } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { NewTask } from './pages/NewTask'
import { Settings } from './pages/Settings'
import { useTaskStore } from './store/taskStore'

export function App(): JSX.Element {
  const { activePage, applyProgress, hydrate, isBootstrapping } = useTaskStore()

  useEffect(() => {
    void hydrate()
    const cleanup = window.api.onProgress((payload) => {
      applyProgress(payload)
    })
    return cleanup
  }, [applyProgress, hydrate])

  const page =
    activePage === 'dashboard'
      ? <Dashboard />
      : activePage === 'new'
        ? <NewTask />
        : activePage === 'history'
          ? <History />
          : <Settings />

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        {isBootstrapping ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="glass-card px-6 py-5 text-center">
              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full mx-auto mb-3 animate-pulse" />
              <p className="text-sm text-gray-200">正在加载任务与设置…</p>
              <p className="text-xs text-gray-500 mt-1">KocardPro Codex Edition</p>
            </div>
          </div>
        ) : (
          page
        )}
      </div>
    </div>
  )
}
