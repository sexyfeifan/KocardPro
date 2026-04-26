import type { TaskStatus, VerificationStatus } from '../types'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatEta(seconds: number): string {
  if (!seconds || seconds === Infinity) return '--'
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}

export function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

export function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt || !completedAt) return '-'
  const totalSeconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'pending':
      return '等待中'
    case 'running':
      return '拷贝中'
    case 'verifying':
      return '汇总校验'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

export function getVerificationLabel(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return '已校验'
    case 'failed':
      return '校验失败'
    case 'skipped':
      return '未校验'
    default:
      return '处理中'
  }
}
