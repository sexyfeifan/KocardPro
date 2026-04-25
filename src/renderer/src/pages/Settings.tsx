import { useState, useEffect, useRef } from 'react'
import { Shield, Info } from 'lucide-react'
import type { HashAlgorithm } from '../types'

const HASH_OPTIONS: { value: HashAlgorithm; label: string; desc: string }[] = [
  { value: 'md5',    label: 'MD5',    desc: '快速，广泛支持' },
  { value: 'sha1',   label: 'SHA1',   desc: '更安全，稍慢' },
  { value: 'sha256', label: 'SHA256', desc: '最安全，推荐' }
]

export function Settings(): JSX.Element {
  const [defaultHash, setDefaultHash] = useState<HashAlgorithm>('md5')
  const [verifyAfterCopy, setVerifyAfterCopy] = useState(true)
  const [saved, setSaved] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const loaded = useRef(false)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setDefaultHash(s.defaultHash)
      setVerifyAfterCopy(s.verifyAfterCopy)
      loaded.current = true
    })
    window.api.getAppVersion().then((v) => setAppVersion(v))
  }, [])

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
              <span className="text-gray-400 text-xs">@我是性感的非凡</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">联系</span>
              <span className="text-gray-400 text-xs font-mono">zhoufeifan@gmail.com</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
