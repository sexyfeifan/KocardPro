import {
  CheckCircle2,
  Clock3,
  Trash2,
  FileDown,
  FileText,
  FolderOpen,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  XCircle
} from 'lucide-react'
import { formatBytes, formatDateTime, formatDuration, formatEta, getStatusLabel, getVerificationLabel } from '../lib/format'
import type { BackupTask } from '../types'

const STATUS_CLASS: Record<BackupTask['status'], string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  verifying: 'text-amber-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-500'
}

function renderStatusIcon(task: BackupTask): JSX.Element {
  if (task.status === 'running' || task.status === 'verifying') {
    return <Loader2 size={12} className="animate-spin" />
  }
  if (task.status === 'completed') return <CheckCircle2 size={12} />
  if (task.status === 'failed') return <XCircle size={12} />
  if (task.status === 'cancelled') return <StopCircle size={12} />
  return <Clock3 size={12} />
}

export function TaskCard({ task }: { task: BackupTask }): JSX.Element {
  const { removeTask } = useTaskStore()
  const progress = task.totalBytes > 0 ? (task.transferredBytes / task.totalBytes) * 100 : 0
  const isActive = task.status === 'running' || task.status === 'verifying'
  const canExport = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
  const primaryDestination = task.destinations[0]

  const handleExport = async () => {
    const savePath = await window.api.saveReport(task.name)
    if (savePath) {
      await window.api.generateReport(task.id, savePath)
    }
  }

  const handleDelete = async () => {
    await window.api.deleteTask(task.id)
    removeTask(task.id)
  }

  return (
    <div className="glass-card p-4 animate-slide-in">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_CLASS[task.status]}`}>
            {renderStatusIcon(task)}
            {getStatusLabel(task.status)}
            <span className="text-gray-600">·</span>
            <span className="text-gray-500 font-mono">{task.hashAlgorithm.toUpperCase()}</span>
            {!task.verifyAfterCopy && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-amber-400">未启用校验</span>
              </>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-100 mt-1 truncate">{task.name}</h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">{task.sourcePath}</p>
          <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-gray-500">
            <span>项目 {task.metadata.projectName || '-'}</span>
            <span>机位 {task.metadata.currentDevice || '-'}</span>
            <span>卷号 {task.metadata.rollName}</span>
            <span>日期 {task.metadata.shootDate || '-'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <button
              onClick={() => void window.api.cancelTask(task.id)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="取消任务"
            >
              <StopCircle size={15} />
            </button>
          )}

          {primaryDestination && (
            <button
              onClick={() => void window.api.revealInFinder(primaryDestination.resolvedPath)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
              title="打开第一个备份目录"
            >
              <FolderOpen size={15} />
            </button>
          )}

          <button
            onClick={() => void window.api.openTaskLog(task.id)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
            title="打开日志目录"
          >
            <FileText size={15} />
          </button>

          {canExport && (
            <button
              onClick={() => void handleExport()}
              className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
              title="导出备份报告"
            >
              <FileDown size={15} />
              </button>
          )}

          {!isActive && (
            <button
              onClick={() => void handleDelete()}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="删除任务"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {(isActive || canExport) && (
        <div className="mb-3">
          <div className="progress-bar h-1.5 mb-1.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                task.status === 'completed'
                  ? 'bg-green-500'
                  : task.status === 'failed'
                    ? 'bg-red-500'
                    : task.status === 'verifying'
                      ? 'bg-amber-400'
                      : 'bg-blue-500'
              }`}
              style={{ width: `${canExport ? Math.max(progress, 100) : progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span className="truncate pr-3">
              {task.currentFile || (task.status === 'completed' ? '所有文件已处理完成' : '等待开始')}
            </span>
            <span>
              {canExport
                ? formatBytes(task.totalBytes)
                : `${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)}`}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div className="bg-[#111] border border-[#202020] rounded-xl px-3 py-2">
          <div className="text-gray-600">文件进度</div>
          <div className="text-gray-200 mt-1 font-mono">
            {task.completedFiles} / {task.totalFiles}
          </div>
        </div>
        <div className="bg-[#111] border border-[#202020] rounded-xl px-3 py-2">
          <div className="text-gray-600">目录数</div>
          <div className="text-gray-200 mt-1 font-mono">{task.summary.directoryCount}</div>
        </div>
        <div className="bg-[#111] border border-[#202020] rounded-xl px-3 py-2">
          <div className="text-gray-600">速度 / 剩余</div>
          <div className="text-gray-200 mt-1 font-mono">
            {formatBytes(task.speedBps)}/s · {formatEta(task.eta)}
          </div>
        </div>
        <div className="bg-[#111] border border-[#202020] rounded-xl px-3 py-2">
          <div className="text-gray-600">校验 / 完成</div>
          <div className="text-gray-200 mt-1 font-mono">
            {task.summary.verificationCompletedFiles}/{task.totalFiles} · {formatDateTime(task.completedAt)}
          </div>
        </div>
      </div>

      {task.verificationLines.length > 0 && (
        <div className="mb-3 rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-500 border-b border-[#202020]">
            最近校验过程
          </div>
          {task.verificationLines.map((line, index) => (
            <div key={`${task.id}-${index}-${line}`} className="px-3 py-2 text-xs text-gray-300 border-t border-[#181818] first:border-t-0">
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {task.destinations.map((destination) => {
          const verified = destination.verificationStatus === 'verified'
          const failed = destination.verificationStatus === 'failed'
          return (
            <div
              key={destination.id}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
                verified
                  ? 'bg-green-500/5 border-green-500/20 text-green-400'
                  : failed
                    ? 'bg-red-500/5 border-red-500/20 text-red-400'
                    : 'bg-[#1e1e1e] border-[#2a2a2a] text-gray-500'
              }`}
              title={destination.resolvedPath}
            >
              {verified ? <ShieldCheck size={10} /> : failed ? <ShieldAlert size={10} /> : <Clock3 size={10} />}
              <span className="max-w-[220px] truncate">
                {destination.label}: {destination.resolvedPath}
              </span>
              <span className="text-[10px] opacity-70">{getVerificationLabel(destination.verificationStatus)}</span>
            </div>
          )
        })}
      </div>

      {task.errorMessage && (
        <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {task.errorMessage}
        </div>
      )}
    </div>
  )
}
