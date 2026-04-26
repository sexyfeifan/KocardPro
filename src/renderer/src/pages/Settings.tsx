import { useState, useEffect, useRef } from 'react'
import { Shield, Info } from 'lucide-react'
import type { HashAlgorithm } from '../types'

const HASH_OPTIONS: { value: HashAlgorithm; label: string; desc: string }[] = [
  { value: 'md5',    label: 'MD5',    desc: '快速，广泛支持' },
  { value: 'sha1',   label: 'SHA1',   desc: '更安全，稍慢' },
  { value: 'sha256', label: 'SHA256', desc: '最安全，推荐' }
]

const FREE_LIMIT = 10

export function Settings(): JSX.Element {
  const [defaultHash, setDefaultHash] = useState<HashAlgorithm>('md5')
  const [verifyAfterCopy, setVerifyAfterCopy] = useState(true)
  const [saved, setSaved] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [backupCount, setBackupCount] = useState(0)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const loaded = useRef(false)
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setDefaultHash(s.defaultHash)
      setVerifyAfterCopy(s.verifyAfterCopy)
      setBackupCount(s.backupCount ?? 0)
      setIsUnlocked(s.isUnlocked ?? false)
      loaded.current = true
    })
    window.api.getAppVersion().then((v) => setAppVersion(v))
  }, [])

  const handleAuthorTap = async () => {
    if (isUnlocked) return
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 2000)
    if (tapCount.current >= 5) {
      tapCount.current = 0
      await window.api.unlock()
      setIsUnlocked(true)
      setShowUnlockModal(true)
    }
  }

  const persist = async (hash: HashAlgorithm, verify: boolean) => {
    if (!loaded.current) return
    const current = await window.api.getSettings()
    window.api.saveSettings({ ...current, defaultHash: hash, verifyAfterCopy: verify })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleHashChange = (v: HashAlgorithm) => {
    setDefaultHash(v)
    persist(v, verifyAfterCopy)
  }

  const handleVerifyToggle = () => {
    const next = !verifyAfterCopy
    setVerifyAfterCopy(next)
    persist(defaultHash, next)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-card p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-2xl mb-3">🎉</div>
            <p className="text-gray-100 font-semibold text-base mb-1">已解锁无限备份</p>
            <p className="text-gray-400 text-sm mb-5">感谢支持，现在可以无限使用所有功能。</p>
            <button
              onClick={() => setShowUnlockModal(false)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              好的
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-5">

        {/* Default hash */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-gray-400" />
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                默认校验算法
              </label>
            </div>
            {saved && <span className="text-xs text-green-400">已保存</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {HASH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleHashChange(opt.value)}
                className={`p-3 rounded-xl border text-left transition-all
                  ${defaultHash === opt.value
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

        {/* Copy options */}
        <div className="glass-card p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            拷贝选项
          </label>
          <div className="flex items-center justify-between py-3 border-b border-[#1e1e1e]">
            <div>
              <p className="text-sm text-gray-200">拷贝后自动校验</p>
              <p className="text-xs text-gray-500 mt-0.5">完成拷贝后对每个文件进行哈希校验</p>
            </div>
            <button
              onClick={handleVerifyToggle}
              className={`relative w-10 h-6 rounded-full transition-colors overflow-hidden focus:outline-none ${verifyAfterCopy ? 'bg-blue-600' : 'bg-[#333]'}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  verifyAfterCopy ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* About */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Info size={14} className="text-gray-400" />
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              关于
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">版本</span>
              <span className="text-gray-300 font-mono">{appVersion ? `v${appVersion}` : 'v1.4.3'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">引擎</span>
              <span className="text-gray-300 font-mono">Electron + React</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">校验标准</span>
              <span className="text-gray-300">MD5 / SHA1 / SHA256</span>
            </div>
            <div className="border-t border-[#1e1e1e] pt-2 mt-2 flex justify-between text-sm">
              <span className="text-gray-500">作者</span>
              <span
                className="text-gray-400 text-xs select-none cursor-default"
                onClick={handleAuthorTap}
              >@我是性感的非凡</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">联系</span>
              <span className="text-gray-400 text-xs font-mono">zhoufeifan@gmail.com</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">备份次数</span>
              {isUnlocked ? (
                <span className="text-green-400 text-xs font-mono">已解锁 · 无限使用</span>
              ) : (
                <span className={`text-xs font-mono ${backupCount >= FREE_LIMIT ? 'text-red-400' : backupCount >= FREE_LIMIT - 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {backupCount} / {FREE_LIMIT}
                  {backupCount >= FREE_LIMIT && '  · 已达上限'}
                </span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
