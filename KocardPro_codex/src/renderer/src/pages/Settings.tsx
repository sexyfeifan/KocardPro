import { useEffect, useMemo, useState } from 'react'
import { Info, Plus, Shield, Trash2 } from 'lucide-react'
import { Toggle } from '../components/Toggle'
import { useTaskStore } from '../store/taskStore'
import type { AppSettings, HashAlgorithm, ProjectPreset, SystemInfo } from '../types'

const HASH_OPTIONS: { value: HashAlgorithm; label: string; desc: string }[] = [
  { value: 'md5', label: 'MD5', desc: '速度快，适合轻量校验' },
  { value: 'sha1', label: 'SHA1', desc: '兼顾速度和可靠性' },
  { value: 'sha256', label: 'SHA256', desc: '推荐用于正式交付' }
]

const DEFAULT_FORM: AppSettings = {
  defaultHashAlgorithm: 'sha256',
  verifyAfterCopy: true,
  defaultNamingTemplate: '{卷号}_{时间}',
  defaultProjectName: '',
  autoRevealAfterExport: true,
  defaultRollPrefix: 'Untitled',
  deviceCatalog: [],
  projectPresets: []
}

function sanitizeValue(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
}

export function Settings(): JSX.Element {
  const { saveSettings, settings } = useTaskStore()
  const [form, setForm] = useState<AppSettings>(settings ?? DEFAULT_FORM)
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [newDeviceName, setNewDeviceName] = useState('')

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  useEffect(() => {
    void window.api.getSystemInfo().then(setSystemInfo)
  }, [])

  const sortedProjectPresets = useMemo(
    () => [...form.projectPresets].sort((a, b) => b.updatedAt - a.updatedAt),
    [form.projectPresets]
  )

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage('')
    try {
      await saveSettings(form)
      setSaveMessage('设置已保存。设备列表与项目预设会立即生效。')
    } catch (error) {
      setSaveMessage((error as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const addDevice = () => {
    const sanitized = sanitizeValue(newDeviceName)
    if (!sanitized) return
    if (form.deviceCatalog.includes(sanitized)) {
      setSaveMessage('这个设备已经存在。')
      return
    }

    setForm((previous) => ({
      ...previous,
      deviceCatalog: [...previous.deviceCatalog, sanitized]
    }))
    setNewDeviceName('')
    setSaveMessage('')
  }

  const removeDevice = (deviceName: string) => {
    setForm((previous) => ({
      ...previous,
      deviceCatalog: previous.deviceCatalog.filter((item) => item !== deviceName),
      projectPresets: previous.projectPresets.map((preset) => ({
        ...preset,
        deviceNames: preset.deviceNames.filter((item) => item !== deviceName)
      }))
    }))
  }

  const removeProjectPreset = (preset: ProjectPreset) => {
    setForm((previous) => ({
      ...previous,
      projectPresets: previous.projectPresets.filter((item) => item.id !== preset.id)
    }))
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-5">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={14} className="text-gray-400" />
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">默认校验算法</label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {HASH_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setForm((prev) => ({ ...prev, defaultHashAlgorithm: option.value }))}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.defaultHashAlgorithm === option.value
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#3a3a3a]'
                }`}
              >
                <div className="text-sm font-semibold mb-0.5">{option.label}</div>
                <div className="text-xs opacity-70">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            默认目录模板
          </label>
          <input
            type="text"
            value={form.defaultNamingTemplate}
            onChange={(event) => setForm((prev) => ({ ...prev, defaultNamingTemplate: event.target.value }))}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />

          <div className="grid grid-cols-2 gap-3 mt-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                默认项目名
              </label>
              <input
                type="text"
                value={form.defaultProjectName}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultProjectName: event.target.value }))}
                placeholder="可留空"
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                默认卷号前缀
              </label>
              <input
                type="text"
                value={form.defaultRollPrefix}
                onChange={(event) => setForm((prev) => ({ ...prev, defaultRollPrefix: event.target.value }))}
                placeholder="Untitled"
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">设备管理</label>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={newDeviceName}
              onChange={(event) => setNewDeviceName(event.target.value)}
              placeholder="新增一个设备，例如 FX3"
              className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="button"
              onClick={addDevice}
              className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={14} />
              添加设备
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {form.deviceCatalog.map((deviceName) => (
              <div
                key={deviceName}
                className="flex items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-gray-200"
              >
                <span>{deviceName}</span>
                <button
                  type="button"
                  onClick={() => removeDevice(deviceName)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {form.deviceCatalog.length === 0 && (
              <span className="text-sm text-gray-600">还没有设备，请先添加。</span>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">已保存项目预设</label>
          <div className="flex flex-col gap-2">
            {sortedProjectPresets.length > 0 ? (
              sortedProjectPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100">{preset.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      设备: {preset.deviceNames.join(', ') || '未配置'} | 模板: {preset.namingTemplate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProjectPreset(preset)}
                    className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-600">尚未保存任何项目预设。新建任务后会自动记录。</p>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">行为选项</label>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">新任务默认启用拷贝后校验</p>
                <p className="text-xs text-gray-500 mt-0.5">关闭后，新建任务默认只执行复制。</p>
              </div>
              <Toggle
                checked={form.verifyAfterCopy}
                onChange={() => setForm((prev) => ({ ...prev, verifyAfterCopy: !prev.verifyAfterCopy }))}
                ariaLabel="切换新任务默认启用拷贝后校验"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-200">导出报告后自动在访达中显示</p>
                <p className="text-xs text-gray-500 mt-0.5">便于快速交付 PDF 与日志。</p>
              </div>
              <Toggle
                checked={form.autoRevealAfterExport}
                onChange={() =>
                  setForm((prev) => ({ ...prev, autoRevealAfterExport: !prev.autoRevealAfterExport }))
                }
                ariaLabel="切换导出报告后自动在访达中显示"
              />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Info size={14} className="text-gray-400" />
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">系统信息</label>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">平台</span>
              <span className="text-gray-300 font-mono">{systemInfo?.platform ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">架构</span>
              <span className="text-gray-300 font-mono">{systemInfo?.arch ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">主机名</span>
              <span className="text-gray-300 font-mono">{systemInfo?.hostname ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">CPU 核心数</span>
              <span className="text-gray-300 font-mono">{systemInfo?.cpus ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">内存</span>
              <span className="text-gray-300 font-mono">
                {systemInfo ? `${(systemInfo.totalMemory / 1024 / 1024 / 1024).toFixed(1)} GB` : '-'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold text-sm transition-all ${
            isSaving
              ? 'bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
          }`}
        >
          {isSaving ? '正在保存…' : '保存设置'}
        </button>

        {saveMessage && (
          <div className="px-4 py-3 rounded-xl bg-[#111] border border-[#2a2a2a] text-sm text-gray-300">
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  )
}
