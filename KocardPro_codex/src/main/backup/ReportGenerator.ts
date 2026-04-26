import { createRequire } from 'module'
import type { BackupTask } from '../types'

const require = createRequire(import.meta.url)
const { BrowserWindow } = require('electron')

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderStatusLabel(task: BackupTask): string {
  if (task.status === 'completed') return '备份完成'
  if (task.status === 'failed') return '任务失败'
  if (task.status === 'cancelled') return '任务取消'
  return '处理中'
}

function renderReportHtml(task: BackupTask): string {
  const taskInfoRows = [
    ['任务名称', task.name],
    ['素材源', task.sourcePath],
    ['项目名', task.metadata.projectName || '-'],
    ['本次机位', task.metadata.currentDevice || '-'],
    ['项目设备', task.metadata.projectDeviceNames.join(', ') || '-'],
    ['卷号', task.metadata.rollName],
    ['拍摄日期', task.metadata.shootDate || '-'],
    ['目录模板', task.namingTemplate],
    ['校验算法', task.verifyAfterCopy ? task.hashAlgorithm.toUpperCase() : '已关闭校验'],
    ['总文件数', `${task.totalFiles} 个`],
    ['总目录数', `${task.summary.directoryCount} 个`],
    ['总数据量', formatBytes(task.totalBytes)],
    ['开始时间', task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'],
    ['结束时间', task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '-'],
    [
      '耗时',
      task.startedAt && task.completedAt ? formatDuration(task.completedAt - task.startedAt) : '-'
    ]
  ]

  const destinationRows = task.destinations
    .map(
      (destination) => `
        <tr>
          <td>${escapeHtml(destination.label)}</td>
          <td>${escapeHtml(destination.resolvedPath)}</td>
          <td>${escapeHtml(formatBytes(destination.bytesWritten))}</td>
          <td>${escapeHtml(
            destination.verificationStatus === 'verified'
              ? '通过'
              : destination.verificationStatus === 'skipped'
                ? '未校验'
                : destination.error || '失败'
          )}</td>
        </tr>
      `
    )
    .join('')

  const fileRows = task.fileRecords
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(record.relativePath)}</td>
          <td>${escapeHtml(formatBytes(record.size))}</td>
          <td>${escapeHtml(record.srcChecksum ? `${record.srcChecksum.slice(0, 16)}...` : '未生成')}</td>
          <td>${escapeHtml(
            record.destinations.every((destination) => destination.verificationStatus === 'verified')
              ? '全部通过'
              : record.destinations.every((destination) => destination.verificationStatus === 'skipped')
                ? '未校验'
                : '存在失败'
          )}</td>
        </tr>
      `
    )
    .join('')

  const verificationLines = task.verificationLines.length
    ? `<div class="log-box">
         <div class="section-title">最后校验信息</div>
         ${task.verificationLines.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join('')}
       </div>`
    : ''

  const errorBlock = task.errorMessage
    ? `<div class="error-box">错误信息：${escapeHtml(task.errorMessage)}</div>`
    : ''

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>KocardPro 报告</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
          color: #1f2937;
          background: white;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 24px;
          border-radius: 20px;
          background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
          color: white;
          margin-bottom: 24px;
        }
        .brand { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
        .sub { font-size: 13px; color: rgba(255,255,255,0.75); }
        .badge {
          padding: 10px 14px;
          border-radius: 999px;
          background: #2563eb;
          font-size: 12px;
          font-weight: 700;
        }
        .section {
          margin-bottom: 24px;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          overflow: hidden;
        }
        .section-title {
          padding: 14px 18px;
          background: #f8fafc;
          font-weight: 700;
          font-size: 14px;
        }
        .grid {
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 0;
        }
        .grid div {
          padding: 11px 18px;
          border-top: 1px solid #eef2f7;
          font-size: 13px;
        }
        .grid div:nth-child(odd) {
          color: #6b7280;
          background: #fcfcfd;
          font-weight: 600;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        th, td {
          text-align: left;
          vertical-align: top;
          padding: 12px 14px;
          border-top: 1px solid #eef2f7;
          word-break: break-word;
        }
        th {
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .error-box {
          margin-bottom: 24px;
          padding: 14px 16px;
          border-radius: 14px;
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          font-size: 13px;
        }
        .log-box {
          margin-bottom: 24px;
          border-radius: 18px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }
        .log-line {
          padding: 12px 18px;
          border-top: 1px solid #eef2f7;
          font-size: 13px;
          color: #374151;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">KocardPro</div>
          <div class="sub">DIT 备份交付报告</div>
          <div class="sub">生成时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</div>
        </div>
        <div class="badge">${escapeHtml(renderStatusLabel(task))}</div>
      </div>

      <div class="section">
        <div class="section-title">任务概览</div>
        <div class="grid">
          ${taskInfoRows
            .map(
              ([label, value]) => `
                <div>${escapeHtml(label)}</div>
                <div>${escapeHtml(value)}</div>
              `
            )
            .join('')}
        </div>
      </div>

      ${errorBlock}
      ${verificationLines}

      <div class="section">
        <div class="section-title">目标盘状态</div>
        <table>
          <thead>
            <tr>
              <th>标签</th>
              <th>目标目录</th>
              <th>写入量</th>
              <th>校验状态</th>
            </tr>
          </thead>
          <tbody>${destinationRows}</tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">文件清单</div>
        <table>
          <thead>
            <tr>
              <th>相对路径</th>
              <th>大小</th>
              <th>源校验</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>${fileRows}</tbody>
        </table>
      </div>
    </body>
  </html>`
}

export async function generateReport(task: BackupTask): Promise<Uint8Array> {
  const html = renderReportHtml(task)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false
    }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true')
    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'default'
      }
    })
    return new Uint8Array(buffer)
  } finally {
    win.destroy()
  }
}
