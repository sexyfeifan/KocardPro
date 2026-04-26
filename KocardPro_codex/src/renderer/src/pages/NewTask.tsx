import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, FolderOpen, Play, Plus, Trash2 } from 'lucide-react'
import { Toggle } from '../components/Toggle'
import { formatLocalDateInputValue } from '../lib/date'
import { formatBytes } from '../lib/format'
import { useTaskStore } from '../store/taskStore'
import type { AppSettings, HashAlgorithm, ProjectPreset } from '../types'

interface DestinationDraft {
  id: string
  path: string
  driveInfo: { total: number; free: number; used: number } | null
}

const HASH_OPTIONS: { value: HashAlgorithm; label: string; desc: string }[] = [
  { value: 'md5', label: 'MD5', desc: '速度快，适合临时比对' },
  { value: 'sha1', label: 'SHA1', desc: '较稳妥，速度适中' },
  { value: 'sha256', label: 'SHA256', desc: '真实校验，建议正式交付使用' }
]

const TEMPLATE_PRESETS = [
  { label: '卷号 / 时间', value: '{卷号}_{时间}' },
  { label: '按日期 / 卷号', value: '{YYYY-MM-DD}/{卷号}' },
  { label: '按机位 / 日期', value: '{机位}/{日期}_{卷号}' },
  { label: '按项目 / 日期', value: '{项目名}/{日期}/{卷号}' },
  { label: '保持原始结构', value: '{原始结构}' }
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCompactTimestamp(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`
}

function sanitizeSegment(value: string): string {
  const sanitized = value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
  if (!sanitized || sanitized === '.' || sanitized === '..') return '未命名'
  return sanitized
}

function normalizeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (!value) return formatLocalDateInputValue()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? formatLocalDateInputValue() : formatLocalDateInputValue(parsed)
}

function buildInitialValues(settings: AppSettings | null) {
  return {
    hashAlgo: settings?.defaultHashAlgorithm ?? 'sha256',
    template: settings?.defaultNamingTemplate ?? '{卷号}_{时间}',
    projectName: settings?.defaultProjectName ?? '',
    verifyAfterCopy: settings?.verifyAfterCopy ?? true,
    shootDate: formatLocalDateInputValue(),
    projectDeviceNames: [] as string[],
    currentDevice: '',
    projectPresetId: undefined as string | undefined
  }
}

function toCompactDate(dateValue: string): string {
  return normalizeDate(dateValue).replaceAll('-', '')
}

function buildRollName(settings: AppSettings | null, timeStampCompact: string): string {
  const prefix = settings?.defaultRollPrefix?.trim() || 'Untitled'
  return `${sanitizeSegment(prefix)}_${timeStampCompact}`
}

function findProjectPreset(projectPresets: ProjectPreset[], projectName: string): ProjectPreset | undefined {
  const trimmed = projectName.trim()
  if (!trimmed) return undefined
  return projectPresets.find((item) => item.name === trimmed)
}

export function NewTask(): JSX.Element {
  const { addTask, setActivePage, settings } = useTaskStore()
  const defaults = useMemo(() => buildInitialValues(settings), [settings])
  const deviceCatalog = settings?.deviceCatalog ?? []
  const projectPresets = settings?.projectPresets ?? []

  const [taskName, setTaskName] = useState('')
  const [projectName, setProjectName] = useState(defaults.projectName)
  const [projectPresetId, setProjectPresetId] = useState<string | undefined>(defaults.projectPresetId)
  const [sourcePath, setSourcePath] = useState('')
  const [shootDate, setShootDate] = useState(defaults.shootDate)
  const [projectDeviceNames, setProjectDeviceNames] = useState<string[]>(defaults.projectDeviceNames)
  const [currentDevice, setCurrentDevice] = useState(defaults.currentDevice)
  const [destinations, setDestinations] = useState<DestinationDraft[]>([])
  const [hashAlgo, setHashAlgo] = useState<HashAlgorithm>(defaults.hashAlgo)
  const [template, setTemplate] = useState(defaults.template)
  const [verifyAfterCopy, setVerifyAfterCopy] = useState(defaults.verifyAfterCopy)
  const [isStarting, setIsStarting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  const [previewTimeStampCompact, setPreviewTimeStampCompact] = useState(formatCompactTimestamp())

  useEffect(() => {
    if (!settings || defaultsApplied) return
    setHashAlgo(settings.defaultHashAlgorithm)
    setTemplate(settings.defaultNamingTemplate)
    setVerifyAfterCopy(settings.verifyAfterCopy)
    setProjectName(settings.defaultProjectName)
    setDefaultsApplied(true)
  }, [defaultsApplied, settings])

  useEffect(() => {
    if (!currentDevice && projectDeviceNames.length > 0) {
      setCurrentDevice(projectDeviceNames[0])
    }
    if (currentDevice && !projectDeviceNames.includes(currentDevice)) {
      setCurrentDevice(projectDeviceNames[0] ?? '')
    }
  }, [currentDevice, projectDeviceNames])

  const applyProjectPreset = (preset: ProjectPreset | undefined, nextProjectName: string): void => {
    setProjectName(nextProjectName)
    if (!preset) {
      setProjectPresetId(undefined)
      return
    }

    setProjectPresetId(preset.id)
    setProjectDeviceNames(preset.deviceNames)
    setCurrentDevice(preset.deviceNames[0] ?? '')
    setHashAlgo(preset.hashAlgorithm)
    setTemplate(preset.namingTemplate)
    setVerifyAfterCopy(preset.verifyAfterCopy)
    setErrorMessage('')
  }

  const handleProjectNameChange = (nextValue: string): void => {
    const matchedPreset = findProjectPreset(projectPresets, nextValue)
    applyProjectPreset(matchedPreset, nextValue)
  }

  const toggleProjectDevice = (deviceName: string): void => {
    setProjectDeviceNames((previous) => {
      const exists = previous.includes(deviceName)
      if (exists) return previous.filter((item) => item !== deviceName)
      return [...previous, deviceName]
    })
  }

  const selectSource = async () => {
    const selectedPath = await window.api.selectDirectory()
    if (!selectedPath) return
    setSourcePath(selectedPath)
    const name = selectedPath.split('/').filter(Boolean).pop() || selectedPath
    if (!taskName) setTaskName(name)
    setErrorMessage('')
  }

  const addDestination = async () => {
    const selectedPath = await window.api.selectDirectory()
    if (!selectedPath) return

    if (destinations.some((destination) => destination.path === selectedPath)) {
      setErrorMessage('这个备份目的地已经添加过了。')
      return
    }

    const driveInfo = await window.api.getDriveInfo(selectedPath)
    setDestinations((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        path: selectedPath,
        driveInfo
      }
    ])
    setErrorMessage('')
  }

  const removeDestination = (id: string) => {
    setDestinations((previous) => previous.filter((destination) => destination.id !== id))
  }

  const canStart = Boolean(
    sourcePath &&
      destinations.length > 0 &&
      taskName.trim() &&
      projectName.trim() &&
      projectDeviceNames.length > 0 &&
      currentDevice
  )

  const previewRollName = buildRollName(settings, previewTimeStampCompact)
  const previewDateFolder = toCompactDate(shootDate)

  const handleStart = async () => {
    if (!canStart) return
    setIsStarting(true)
    setErrorMessage('')

    try {
      const timeStampCompact = formatCompactTimestamp()
      const rollName = buildRollName(settings, timeStampCompact)
      const normalizedShootDate = normalizeDate(shootDate)

      const task = await window.api.createTask({
        name: taskName.trim(),
        sourcePath,
        destinationPaths: destinations.map((destination) => destination.path),
        hashAlgorithm: hashAlgo,
        namingTemplate: template,
        verifyAfterCopy,
        metadata: {
          projectName: projectName.trim(),
          projectPresetId,
          projectDeviceNames: projectDeviceNames.map((deviceName) => sanitizeSegment(deviceName)),
          currentDevice: sanitizeSegment(currentDevice),
          shootDate: normalizedShootDate,
          shootDateCompact: toCompactDate(normalizedShootDate),
          rollName,
          timeStampCompact
        }
      })

      addTask(task)
      setPreviewTimeStampCompact(formatCompactTimestamp())
      await window.api.startTask(task.id)
      setActivePage('dashboard')
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-5">
        <div className="glass-card p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                任务名称
              </label>
              <input
                type="text"
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                placeholder="例如：20260423 城市探店_自贡"
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                项目名
              </label>
              <input
                type="text"
                list="project-presets"
                value={projectName}
                onChange={(event) => handleProjectNameChange(event.target.value)}
                placeholder="输入或选择一个已保存项目"
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <datalist id="project-presets">
                {projectPresets.map((preset) => (
                  <option key={preset.id} value={preset.name} />
                ))}
              </datalist>
              <p className="text-xs text-gray-600 mt-2">
                已保存项目会自动复用机位、校验和模板设置。
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">项目机位设备</label>
            <span className="text-xs text-gray-600">{projectDeviceNames.length} 个已选择</span>
          </div>

          {deviceCatalog.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {deviceCatalog.map((deviceName) => {
                  const selected = projectDeviceNames.includes(deviceName)
                  return (
                    <button
                      key={deviceName}
                      type="button"
                      onClick={() => toggleProjectDevice(deviceName)}
                      className={`px-3 py-2 rounded-xl border text-sm transition-all ${
                        selected
                          ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                          : 'bg-[#111] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                      }`}
                    >
                      {deviceName}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-[1fr_280px] gap-3">
                <div className="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3">
                  <p className="text-xs text-gray-500 mb-2">当前项目将创建这些机位目录</p>
                  <div className="flex flex-wrap gap-2">
                    {projectDeviceNames.length > 0 ? (
                      projectDeviceNames.map((deviceName) => (
                        <span
                          key={deviceName}
                          className="px-2.5 py-1 rounded-lg bg-white/5 border border-[#2a2a2a] text-xs text-gray-300"
                        >
                          {deviceName}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-600">请先勾选设备</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    本次素材归属机位
                  </label>
                  <select
                    value={currentDevice}
                    onChange={(event) => setCurrentDevice(event.target.value)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">请选择</option>
                    {projectDeviceNames.map((deviceName) => (
                      <option key={deviceName} value={deviceName}>
                        {deviceName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-4 text-sm text-gray-500">
              还没有可用设备，请先到设置页添加设备选项。
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="grid grid-cols-[1fr_220px] gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                素材源
              </label>
              <button
                onClick={() => void selectSource()}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm ${
                  sourcePath
                    ? 'bg-blue-600/10 border-blue-500/30 text-blue-300'
                    : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#444] hover:text-gray-400 border-dashed'
                }`}
              >
                <FolderOpen size={16} className="shrink-0" />
                <span className="truncate text-left">{sourcePath || '点击选择素材卡或文件夹…'}</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                拍摄日期
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={shootDate}
                  onChange={(event) => setShootDate(event.target.value)}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 pr-11 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <CalendarDays size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">备份目的地</label>
            <span className="text-xs text-gray-600">{destinations.length} 个</span>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            {destinations.map((destination) => {
              const currentCopyPath =
                projectDeviceNames.length > 0 && currentDevice
                  ? `${destination.path}/${previewDateFolder}/${sanitizeSegment(currentDevice)}/${template === '{原始结构}' ? '' : buildRollName(settings, previewTimeStampCompact)}`
                  : `${destination.path}/${previewDateFolder}`

              return (
                <div
                  key={destination.id}
                  className="flex items-start gap-3 bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3"
                >
                  <FolderOpen size={14} className="text-green-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{destination.path}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      将创建日期目录: {previewDateFolder} / {projectDeviceNames.join(', ') || '未选择机位'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      当前素材目录: {template === '{原始结构}' ? `${destination.path}/${previewDateFolder}/${sanitizeSegment(currentDevice || '未选择')}` : currentCopyPath}
                    </p>
                    {destination.driveInfo && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500/60 rounded-full"
                            style={{ width: `${(destination.driveInfo.used / destination.driveInfo.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">
                          剩余 {formatBytes(destination.driveInfo.free)}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeDestination(destination.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => void addDestination()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#2a2a2a] text-gray-500 hover:border-[#444] hover:text-gray-400 transition-all text-sm"
          >
            <Plus size={15} />
            添加目的地
          </button>
        </div>

        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            校验与目录规则
          </label>

          <div className="grid grid-cols-3 gap-2 mb-5">
            {HASH_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setHashAlgo(option.value)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  hashAlgo === option.value
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#3a3a3a]'
                }`}
              >
                <div className="text-sm font-semibold mb-0.5">{option.label}</div>
                <div className="text-xs opacity-70">{option.desc}</div>
              </button>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">目录模板</label>
              <span className="text-xs text-gray-600">素材会复制到 当前机位 / 模板目录</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {TEMPLATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setTemplate(preset.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    template === preset.value
                      ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                      : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#3a3a3a]'
                  }`}
                >
                  <div className="text-xs font-medium mb-0.5">{preset.label}</div>
                  <div className="text-xs font-mono opacity-60 truncate">{preset.value}</div>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="{卷号}_{时间}"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-600 mt-2">
              默认卷号将自动生成，例如 {previewRollName}。支持占位符:
              {' {YYYY-MM-DD} / {日期} / {卷号} / {时间} / {机位} / {项目名} / {任务名}'}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-[#1e1e1e]">
            <div>
              <p className="text-sm text-gray-200">拷贝后自动校验</p>
              <p className="text-xs text-gray-500 mt-0.5">开启后会在拷贝结束后做真实哈希校验，并显示过程与结果。</p>
            </div>
            <Toggle
              checked={verifyAfterCopy}
              onChange={() => setVerifyAfterCopy((value) => !value)}
              ariaLabel="切换拷贝后自动校验"
            />
          </div>
        </div>

        <button
          onClick={() => void handleStart()}
          disabled={!canStart || isStarting}
          className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold text-sm transition-all ${
            canStart && !isStarting
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
              : 'bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-not-allowed'
          }`}
        >
          <Play size={16} />
          {isStarting ? '正在启动任务…' : '开始备份'}
        </button>

        {errorMessage && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {!canStart && !errorMessage && (
          <p className="text-center text-xs text-gray-600">
            请填写任务名称、项目名，选择机位、素材源和至少一个备份目的地。
          </p>
        )}
      </div>
    </div>
  )
}
