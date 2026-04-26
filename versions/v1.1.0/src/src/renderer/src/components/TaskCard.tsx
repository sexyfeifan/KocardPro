import { CheckCircle2, XCircle, Clock, Loader2, FolderOpen, FileDown, StopCircle, Trash2 } from 'lucide-react'
import type { BackupTask } from '../types'
import { useTaskStore } from '../store/taskStore'

function formatBytes(b: number): string {
  if (b === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function formatEta(seconds: number): string {
  if (!seconds || seconds === Infinity) return '--'
  if (seconds < 60) return `${Math.ceil(seconds)}秒`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}分钟`
  return `${(seconds / 3600).toFixed(1)}小时`
}

const STATUS_CONFIG = {
  pending:   { color: 'text-gray-400', bg: 'bg-gray-400', label: '等待中', Icon: Clock },
  running:   { color: 'text-blue-400', bg: 'bg-blue-500', label: '拷贝中', Icon: Loader2 },
  verifying: { color: 'text-amber-400', bg: 'bg-amber-400', label: '校验中', Icon: Loader2 },
  completed: { color: 'text-green-400', bg: 'bg-green-500', label: '已完成', Icon: CheckCircle2 },
  failed:    { color: 'text-red-400',  bg: 'bg-red-500',   label: '失败',   Icon: XCircle },
  cancelled: { color: 'text-gray-500', bg: 'bg-gray-500',  label: '已取消', Icon: XCircle }
}

interface Props { task: BackupTask }

export function TaskCard({ task }: Props): JSX.Element {
  const { deleteTask } = useTaskStore()
  const cfg = STATUS_CONFIG[task.status]
  const Icon = cfg.Icon
  const progress = task.totalBytes > 0 ? (task.transferredBytes / task.totalBytes) * 100 : 0
  const isActive = task.status === 'running' || task.status === 'verifying'
  const isDone = !isActive

  const handleCancel = () => window.api.cancelTask(task.id)

  const handleExport = async () => {
    const savePath = await window.api.saveReport(task.name)
    if (savePath) {
      await window.api.generateReport(task.id, savePath)
      window.api.revealInFinder(savePath)
    }
  }

  const handleReveal = () => {
    if (task.destinations[0]) window.api.revealInFinder(task.destinations[0].path)
  }

  const handleDelete = () => deleteTask(task.id)

  const recentVerifyLog = task.verifyLog ? task.verifyLog.slice(-3) : []

  return (
    <div className="glass-card p-4 animate-slide-in">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
              <Icon size={12} className={isActive ? 'animate-spin' : ''} />
              {cfg.label}
            </span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-500 text-xs font-mono">{task.hashAlgorithm.toUpperCase()}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-100 truncate">{task.name}</h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">{task.sourcePath}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-3 shrink-0">
          {isActive && (
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="取消任务"
            >
              <StopCircle size={15} />
            </button>
          )}
          {task.status === 'completed' && (
            <>
              <button
                onClick={handleReveal}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                title="在访达中显示"
              >
                <FolderOpen size={15} />
              </button>
              <button
                onClick={handleExport}
                className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                title="导出备份报告"
              >
                <FileDown size={15} />
              </button>
            </>
          )}
          {isDone && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="删除任务记录"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Completion banner */}
      {task.status === 'completed' && (
        <div className="mb-3 px-3 py-2.5 bg-green-500/10 border border-green-500/25 rounded-lg flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          <span className="text-xs font-medium text-green-400">
            备份完成 — 全部 {task.totalFiles} 个文件已校验通过
          </span>
        </div>
      )}
      {task.status === 'failed' && (
        <div className="mb-3 px-3 py-2.5 bg-red-500/10 border border-red-500/25 rounded-lg flex items-center gap-2">
          <XCircle size={14} className="text-red-400 shrink-0" />
          <span className="text-xs font-medium text-red-400">备份失败</span>
        </div>
      )}
      {task.status === 'cancelled' && (
        <div className="mb-3 px-3 py-2.5 bg-gray-500/10 border border-gray-500/25 rounded-lg flex items-center gap-2">
          <XCircle size={14} className="text-gray-500 shrink-0" />
          <span className="text-xs font-medium text-gray-500">任务已取消</span>
        </div>
      )}

      {/* Progress bar */}
      {(isActive || task.status === 'completed') && (
        <div className="mb-3">
          <div className="progress-bar h-1.5 mb-1.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                task.status === 'completed' ? 'bg-green-500' :
                task.status === 'verifying' ? 'bg-amber-400' : 'bg-blue-500'
              }`}
              style={{ width: `${task.status === 'completed' ? 100 : progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              {task.status === 'verifying' ? '正在校验校验值...' :
               task.status === 'completed' ? `${task.totalFiles} 个文件` :
               task.currentFile ? task.currentFile : '准备中...'}
            </span>
            <span>
              {task.status === 'completed'
                ? formatBytes(task.totalBytes)
                : `${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)}`}
            </span>
          </div>
        </div>
      )}

      {/* Real-time verify log */}
      {task.status === 'verifying' && recentVerifyLog.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-[#111] border border-[#2a2a2a] rounded-lg">
          {recentVerifyLog.map((line, i) => (
            <p
              key={i}
              className={`text-xs font-mono leading-5 ${
                line.startsWith('✓') ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Stats row */}
      {isActive && (
        <div className="flex gap-4 text-xs mb-3">
          <div>
            <span className="text-gray-600">速度 </span>
            <span className="text-gray-300 font-mono">{formatBytes(task.speedBps)}/s</span>
          </div>
          <div>
            <span className="text-gray-600">剩余 </span>
            <span className="text-gray-300 font-mono">{formatEta(task.eta)}</span>
          </div>
          <div>
            <span className="text-gray-600">文件 </span>
            <span className="text-gray-300 font-mono">{task.completedFiles}/{task.totalFiles}</span>
          </div>
        </div>
      )}

      {/* Destinations */}
      <div className="flex flex-wrap gap-2">
        {task.destinations.map((dest) => (
          <div
            key={dest.id}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border
              ${dest.verified
                ? 'bg-green-500/5 border-green-500/20 text-green-400'
                : dest.error
                  ? 'bg-red-500/5 border-red-500/20 text-red-400'
                  : 'bg-[#1e1e1e] border-[#2a2a2a] text-gray-500'
              }`}
          >
            {dest.verified ? <CheckCircle2 size={10} /> : dest.error ? <XCircle size={10} /> : null}
            <span className="max-w-[160px] truncate" title={dest.path}>
              {dest.path.split('/').pop() || dest.path}
            </span>
          </div>
        ))}
      </div>

      {/* Error */}
      {task.errorMessage && (
        <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {task.errorMessage}
        </div>
      )}
    </div>
  )
}
