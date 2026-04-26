import { useState, useEffect } from 'react'
import { FolderOpen, Plus, Trash2, Play, ChevronDown, Save } from 'lucide-react'
import { useTaskStore } from '../store/taskStore'
import type { HashAlgorithm, ProjectConfig } from '../types'
import { v4 as uuidv4 } from 'uuid'

function formatBytes(b: number): string {
  if (b === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface DriveInfo { total: number; free: number; used: number }

interface DestRow {
  id: string
  path: string
  driveInfo: DriveInfo | null
}

const HASH_OPTIONS: { value: HashAlgorithm; label: string; desc: string }[] = [
  { value: 'md5',    label: 'MD5',    desc: '快速，广泛支持' },
  { value: 'sha1',   label: 'SHA1',   desc: '更安全，稍慢' },
  { value: 'sha256', label: 'SHA256', desc: '最安全，推荐' }
]

export function NewTask(): JSX.Element {
  const { addTask, setActivePage, projects, devices, loadProjects, loadDevices, setProjects } = useTaskStore()

  const [taskName, setTaskName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [destinations, setDestinations] = useState<DestRow[]>([])
  const [hashAlgo, setHashAlgo] = useState<HashAlgorithm>('md5')
  const [shootingDate, setShootingDate] = useState(todayLocal())
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [volumePrefix, setVolumePrefix] = useState('Untitled')
  const [isStarting, setIsStarting] = useState(false)

  // Project config
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [savingProject, setSavingProject] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s) => setHashAlgo(s.defaultHash))
    loadProjects()
    loadDevices()
  }, [])

  const applyProject = (project: ProjectConfig) => {
    setSelectedProjectId(project.id)
    setSelectedDevices(project.devices)
    setVolumePrefix(project.volumePrefix || 'Untitled')
    setShowProjectDropdown(false)
  }

  const handleSaveProject = async () => {
    const name = newProjectName.trim() || taskName.trim() || 'Untitled'
    const project: ProjectConfig = {
      id: selectedProjectId || uuidv4(),
      name,
      devices: selectedDevices,
      directoryTemplate: '',
      volumePrefix
    }
    setSavingProject(true)
    try {
      const updated = await window.api.saveProject(project)
      setProjects(updated)
      setSelectedProjectId(project.id)
      setNewProjectName('')
    } finally {
      setSavingProject(false)
    }
  }

  const toggleDevice = (device: string) => {
    setSelectedDevices((prev) =>
      prev.includes(device) ? prev.filter((d) => d !== device) : [...prev, device]
    )
  }

  const selectSource = async () => {
    const p = await window.api.selectDirectory()
    if (!p) return
    setSourcePath(p)
    const name = p.split('/').pop() || p
    if (!taskName) setTaskName(name)
  }

  const addDestination = async () => {
    const p = await window.api.selectDirectory()
    if (!p) return
    const info = await window.api.getDriveInfo(p)
    setDestinations((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), path: p, driveInfo: info }
    ])
  }

  const removeDestination = (id: string) =>
    setDestinations((prev) => prev.filter((d) => d.id !== id))

  const canStart = sourcePath && destinations.length > 0 && taskName.trim() && selectedDevices.length > 0

  const handleStart = async () => {
    if (!canStart) return
    setIsStarting(true)
    try {
      const task = await window.api.createTask({
        name: taskName.trim(),
        sourcePath,
        devices: selectedDevices,
        destinationPaths: destinations.map((d) => d.path),
        hashAlgorithm: hashAlgo,
        namingTemplate: volumePrefix,
        shootingDate
      })
      addTask(task)
      await window.api.startTask(task.id)
      setActivePage('dashboard')
    } finally {
      setIsStarting(false)
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
      <div className="flex flex-col gap-5">

        {/* Project config */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            可复用项目配置
          </label>

          {/* Dropdown selector */}
          <div className="relative mb-3">
            <button
              onClick={() => setShowProjectDropdown((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#111] text-sm text-gray-300 hover:border-[#444] transition-colors"
            >
              <span>{selectedProject ? selectedProject.name : '选择已有项目配置...'}</span>
              <ChevronDown size={14} className="text-gray-500" />
            </button>
            {showProjectDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
                {projects.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-500">暂无保存的项目</div>
                )}
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyProject(p)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-colors border-b border-[#2a2a2a] last:border-b-0"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.devices.join(' / ')} · 前缀: {p.volumePrefix || 'Untitled'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume prefix */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1.5">卷名前缀</label>
            <input
              type="text"
              value={volumePrefix}
              onChange={(e) => setVolumePrefix(e.target.value)}
              placeholder="Untitled"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600
                focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-600 mt-1">
              最终卷名: {volumePrefix || 'Untitled'}_{new Date().getFullYear()}{String(new Date().getMonth()+1).padStart(2,'0')}{String(new Date().getDate()).padStart(2,'0')}HHmm
            </p>
          </div>

          {/* Save project */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={selectedProject ? `更新「${selectedProject.name}」` : '输入项目名称保存...'}
              className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600
                focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={handleSaveProject}
              disabled={savingProject}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-gray-400
                hover:border-blue-500/50 hover:text-blue-400 transition-colors disabled:opacity-50"
            >
              <Save size={12} />
              {savingProject ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* Task name */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            任务名称
          </label>
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="例如：DAY01_A机_ARRI"
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600
              focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Shooting date */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            拍摄日期
          </label>
          <input
            type="date"
            value={shootingDate}
            onChange={(e) => setShootingDate(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-gray-200
              focus:outline-none focus:border-blue-500 transition-colors
              [color-scheme:dark]"
          />
        </div>

        {/* Device selection */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            机位选择
          </label>
          {devices.length === 0 ? (
            <p className="text-xs text-gray-500">请在设置中添加机位</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {devices.map((device) => {
                const checked = selectedDevices.includes(device)
                return (
                  <button
                    key={device}
                    onClick={() => toggleDevice(device)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all
                      ${checked
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                        : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#3a3a3a]'
                      }`}
                  >
                    {device}
                  </button>
                )
              })}
            </div>
          )}
          {selectedDevices.length === 0 && (
            <p className="text-xs text-amber-500/70 mt-2">请至少选择一个机位</p>
          )}
        </div>

        {/* Source */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            素材源
          </label>
          <button
            onClick={selectSource}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm
              ${sourcePath
                ? 'bg-blue-600/10 border-blue-500/30 text-blue-300'
                : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#444] hover:text-gray-400 border-dashed'
              }`}
          >
            <FolderOpen size={16} className="shrink-0" />
            <span className="truncate text-left">{sourcePath || '点击选择素材卡或文件夹...'}</span>
          </button>
        </div>

        {/* Destinations */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              备份目的地
            </label>
            <span className="text-xs text-gray-600">{destinations.length} 个</span>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            {destinations.map((dest) => (
              <div key={dest.id} className="flex items-center gap-3 bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3">
                <FolderOpen size={14} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{dest.path}</p>
                  {dest.driveInfo && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500/60 rounded-full"
                          style={{ width: `${(dest.driveInfo.used / dest.driveInfo.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">
                        剩余 {formatBytes(dest.driveInfo.free)}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeDestination(dest.id)}
                  className="p-1.5 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addDestination}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#2a2a2a] text-gray-500
              hover:border-[#444] hover:text-gray-400 transition-all text-sm"
          >
            <Plus size={15} />
            添加目的地
          </button>
        </div>

        {/* Hash options */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            校验算法
          </label>
          <div className="grid grid-cols-3 gap-2">
            {HASH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setHashAlgo(opt.value)}
                className={`p-3 rounded-xl border text-left transition-all
                  ${hashAlgo === opt.value
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-[#111] border-[#2a2a2a] text-gray-500 hover:border-[#3a3a3a]'
                  }`}
              >
                <div className="text-sm font-semibold mb-0.5">{opt.label}</div>
                <div className="text-xs opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!canStart || isStarting}
          className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold text-sm transition-all
            ${canStart && !isStarting
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
              : 'bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-not-allowed'
            }`}
        >
          <Play size={16} />
          {isStarting ? '正在启动...' : '开始备份'}
        </button>

        {!canStart && (
          <p className="text-center text-xs text-gray-600">
            请填写任务名称、选择素材源、至少一个机位和目的地
          </p>
        )}
      </div>
    </div>
  )
}
