import { useTaskStore } from '../store/taskStore'
import { TaskCard } from '../components/TaskCard'
import { Clock } from 'lucide-react'

export function History(): JSX.Element {
  const { tasks } = useTaskStore()
  const done = tasks.filter((t) =>
    t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
  )

  if (done.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <Clock size={28} className="text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium mb-1">暂无历史记录</p>
        <p className="text-gray-600 text-sm">完成的备份任务将显示在这里</p>
      </div>
    )
  }

  const totalBytes = done.reduce((s, t) => s + t.totalBytes, 0)
  const successCount = done.filter((t) => t.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">总任务数</div>
          <div className="text-2xl font-bold text-gray-200">{done.length}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">成功率</div>
          <div className="text-2xl font-bold text-green-400">
            {done.length > 0 ? Math.round((successCount / done.length) * 100) : 0}%
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">总数据量</div>
          <div className="text-2xl font-bold text-blue-400">
            {(totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {done.map((t) => <TaskCard key={t.id} task={t} />)}
      </div>
    </div>
  )
}
