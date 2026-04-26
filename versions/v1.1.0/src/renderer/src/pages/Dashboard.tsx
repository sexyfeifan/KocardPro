import { useTaskStore } from '../store/taskStore'
import { TaskCard } from '../components/TaskCard'
import { HardDrive, Plus, Eject } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

function formatBytes(b: number): string {
  if (b === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

interface VolumeInfo {
  name: string
  path: string
  total: number
  free: number
  used: number
}

function ConnectedDrives(): JSX.Element {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [ejecting, setEjecting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const vols = await window.api.listVolumes()
    setVolumes(vols as VolumeInfo[])
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const handleEject = async (vol: VolumeInfo) => {
    setEjecting(vol.path)
    await window.api.ejectVolume(vol.path)
    await refresh()
    setEjecting(null)
  }

  if (volumes.length === 0) return <></>

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        已连接储存设备
      </h2>
      <div className="flex flex-col gap-2">
        {volumes.map((vol) => {
          const usedPct = vol.total > 0 ? (vol.used / vol.total) * 100 : 0
          const isEjecting = ejecting === vol.path
          return (
            <div key={vol.path} className="glass-card px-4 py-3 flex items-center gap-4">
              <HardDrive size={18} className="text-gray-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-200 truncate">{vol.name}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">
                    {formatBytes(vol.free)} 可用 / {formatBytes(vol.total)}
                  </span>
                </div>
                <div className="h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usedPct > 85 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-400' : 'bg-blue-500'}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => handleEject(vol)}
                disabled={isEjecting}
                className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
                title="推出"
              >
                <Eject size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Dashboard(): JSX.Element {
  const { tasks, setActivePage } = useTaskStore()
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'verifying')
  const completed = tasks.filter((t) => t.status === 'completed')
  const failed = tasks.filter((t) => t.status === 'failed')
  const totalBytes = tasks.reduce((s, t) => s + t.totalBytes, 0)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: '运行中', value: running.length, color: 'text-blue-400', dot: 'bg-blue-500' },
          { label: '已完成', value: completed.length, color: 'text-green-400', dot: 'bg-green-500' },
          { label: '失败', value: failed.length, color: 'text-red-400', dot: 'bg-red-500' },
          { label: '总数据量', value: formatBytes(totalBytes), color: 'text-gray-300', dot: 'bg-gray-500' }
        ].map(({ label, value, color, dot }) => (
          <div key={label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Connected drives */}
      <ConnectedDrives />

      {/* Active tasks */}
      {running.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            进行中
          </h2>
          <div className="flex flex-col gap-3">
            {running.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </div>
      )}

      {/* All tasks */}
      {tasks.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            全部任务
          </h2>
          <div className="flex flex-col gap-3">
            {tasks
              .filter((t) => t.status !== 'running' && t.status !== 'verifying')
              .map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <HardDrive size={28} className="text-gray-600" />
          </div>
          <p className="text-gray-400 font-medium mb-1">暂无备份任务</p>
          <p className="text-gray-600 text-sm mb-4">选择素材源和目的地，开始你的第一次备份</p>
          <button
            onClick={() => setActivePage('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            新建备份任务
          </button>
        </div>
      )}
    </div>
  )
}
