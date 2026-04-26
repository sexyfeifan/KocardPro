import { Clock } from 'lucide-react'
import { TaskCard } from '../components/TaskCard'
import { formatBytes } from '../lib/format'
import { useTaskStore } from '../store/taskStore'

export function History(): JSX.Element {
  const { tasks } = useTaskStore()
  const historyTasks = tasks.filter((task) =>
    task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
  )

  if (historyTasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <Clock size={28} className="text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium mb-1">暂无历史记录</p>
        <p className="text-gray-600 text-sm">完成、失败或取消的任务会在这里保留。</p>
      </div>
    )
  }

  const totalBytes = historyTasks.reduce((sum, task) => sum + task.totalBytes, 0)
  const successCount = historyTasks.filter((task) => task.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">总任务数</div>
          <div className="text-2xl font-bold text-gray-200">{historyTasks.length}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">成功率</div>
          <div className="text-2xl font-bold text-green-400">
            {historyTasks.length > 0 ? Math.round((successCount / historyTasks.length) * 100) : 0}%
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-gray-500 mb-1">累计数据量</div>
          <div className="text-2xl font-bold text-blue-400">{formatBytes(totalBytes)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {historyTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}
