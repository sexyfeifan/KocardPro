import { useTaskStore } from '../store/taskStore'

const PAGE_TITLES = {
  dashboard: '任务总览',
  new: '新建备份任务',
  history: '历史记录',
  settings: '设置'
} as const

export function Header(): JSX.Element {
  const { activePage, settings, tasks } = useTaskStore()
  const running = tasks.filter((task) => task.status === 'running' || task.status === 'verifying').length
  const completed = tasks.filter((task) => task.status === 'completed').length
  const failed = tasks.filter((task) => task.status === 'failed').length

  return (
    <header className="drag-region flex items-center justify-between px-6 h-14 border-b border-[#1e1e1e] bg-[#0a0a0a] shrink-0">
      <div className="flex items-center gap-3 no-drag">
        <div className="w-16" />
        <div>
          <h1 className="text-sm font-semibold text-gray-200">{PAGE_TITLES[activePage]}</h1>
          <p className="text-[11px] text-gray-500">
            默认校验 {settings?.defaultHashAlgorithm.toUpperCase() ?? '--'} | 默认模板{' '}
            {settings?.defaultNamingTemplate ?? '--'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 no-drag text-xs text-gray-500">
        {running > 0 && (
          <span className="flex items-center gap-1.5 text-blue-400 font-medium">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            {running} 个任务运行中
          </span>
        )}
        <span className="text-green-500">{completed} 个已完成</span>
        {failed > 0 && <span className="text-red-400">{failed} 个失败</span>}
        <span className="text-[#333]">|</span>
        <span>KocardPro Codex</span>
      </div>
    </header>
  )
}
