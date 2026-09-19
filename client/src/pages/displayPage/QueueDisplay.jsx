import { useCallback, useEffect, useRef, useState } from 'react'
import { MdLock, MdLockOpen, MdVolumeUp, MdWifi, MdWifiOff } from 'react-icons/md'

const useCurrentTime = () => {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return time
}

const formatDate = (value) => value.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const formatTime = (value) => value.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const typeLabel = (type) => type === 'derma' ? 'Dermatology' : 'General Medicine'

const QueueDisplay = () => {
  const [queue, setQueue] = useState({ serving: null, waiting: [], clinicOpen: true })
  const [connected, setConnected] = useState(true)
  const [displayUnlocked, setDisplayUnlocked] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [pin, setPin] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [isMonitoring, setIsMonitoring] = useState(false)
  const audioContextRef = useRef(null)
  const previousWaitingLengthRef = useRef(0)
  const now = useCurrentTime()

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Carait Clinic Queue Display'
    let robots = document.querySelector('meta[name="robots"]')
    const created = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.setAttribute('name', 'robots')
      document.head.appendChild(robots)
    }
    const previousContent = robots.getAttribute('content')
    robots.setAttribute('content', 'noindex, nofollow, noarchive')

    return () => {
      document.title = previousTitle
      if (created) robots.remove()
      else if (previousContent === null) robots.removeAttribute('content')
      else robots.setAttribute('content', previousContent)
    }
  }, [])

  const playChime = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const gain = ctx.createGain()
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()

    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, ctx.currentTime)
    osc1.connect(gain)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.3)

    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.3)
    osc2.connect(gain)
    osc2.start(ctx.currentTime + 0.3)
    osc2.stop(ctx.currentTime + 0.6)
  }, [])

  const enableAudio = useCallback(async () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      setIsMonitoring(true)
      return
    }
    if (!audioContextRef.current) audioContextRef.current = new AudioCtx()
    await audioContextRef.current.resume()
    setIsMonitoring(true)
  }, [])

  const fetchQueue = useCallback(async ({ initial = false } = {}) => {
    try {
      const response = await fetch('/api/queue/live', { credentials: 'include', cache: 'no-store' })
      if (response.status === 401) {
        setDisplayUnlocked(false)
        setConnected(true)
        return false
      }
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Queue unavailable.')

      setDisplayUnlocked(true)
      setQueue(data)
      setConnected(true)

      if (!initial && isMonitoring && data.waiting?.length > previousWaitingLengthRef.current) {
        playChime()
      }
      previousWaitingLengthRef.current = data.waiting?.length || 0
      return true
    } catch {
      setConnected(false)
      return false
    }
  }, [isMonitoring, playChime])

  useEffect(() => {
    fetchQueue({ initial: true }).finally(() => setCheckingSession(false))
  }, [fetchQueue])

  useEffect(() => {
    if (!displayUnlocked) return undefined
    const timer = window.setInterval(() => fetchQueue(), 10000)
    return () => window.clearInterval(timer)
  }, [displayUnlocked, fetchQueue])

  const unlockAndMonitor = async (event) => {
    event.preventDefault()
    setUnlocking(true)
    setUnlockError('')
    try {
      const response = await fetch('/api/queue/display/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not unlock queue display.')
      await enableAudio()
      setPin('')
      setDisplayUnlocked(true)
      await fetchQueue({ initial: true })
    } catch (error) {
      setUnlockError(error.message || 'Could not unlock queue display.')
    } finally {
      setUnlocking(false)
    }
  }

  const lockDisplay = async () => {
    await fetch('/api/queue/display/lock', { method: 'POST', credentials: 'include' }).catch(() => {})
    setDisplayUnlocked(false)
    setIsMonitoring(false)
    setQueue({ serving: null, waiting: [], clinicOpen: true })
    previousWaitingLengthRef.current = 0
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0b1a2c] flex items-center justify-center text-slate-300">
        <div className="text-center">
          <img src="/logo.png" alt="Carait Clinic" className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white/10 p-2" />
          <p className="text-sm font-semibold">Checking queue display session…</p>
        </div>
      </div>
    )
  }

  if (!displayUnlocked) {
    return (
      <div className="min-h-screen bg-[#0b1a2c] flex items-center justify-center px-4 py-8 text-white">
        <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-7 shadow-2xl">
          <div className="text-center">
            <img src="/logo.png" alt="Carait Clinic" className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white/10 p-2" />
            <h1 className="text-xl font-black">Carait Clinic Queue Display</h1>
            <p className="mt-2 text-sm text-slate-400">Enter the clinic display PIN to show the live waiting-room queue.</p>
          </div>

          <form onSubmit={unlockAndMonitor} className="mt-7 space-y-4">
            {unlockError && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {unlockError}
              </div>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Display PIN</span>
              <div className="relative">
                <MdLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="Enter 6-12 digit PIN"
                  className="w-full rounded-2xl border border-white/10 bg-[#10243a] py-3.5 pl-11 pr-4 text-center text-lg font-black tracking-[0.3em] text-white outline-none placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-500 focus:border-sky-400/60"
                  autoFocus
                  required
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={unlocking || pin.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3.5 text-sm font-black text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MdLockOpen /> {unlocking ? 'Unlocking…' : 'Unlock & Start Queue Monitor'}
            </button>
          </form>
          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">This display uses queue numbers only. Patient names and contact information are not shown.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1a2c] px-4 py-6 text-white md:px-8">
      {!isMonitoring && (
        <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
          <p className="text-sm text-sky-100">Queue display is unlocked. Enable sound to hear a chime when the waiting queue grows.</p>
          <button onClick={enableAudio} className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-sky-700">
            <MdVolumeUp /> Enable Sound
          </button>
        </div>
      )}

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Carait Clinic" className="h-14 w-14 rounded-2xl bg-white/10 p-2" />
          <div>
            <h1 className="text-xl font-black tracking-tight">Carait Medical and Dermatology Clinic</h1>
            <p className="text-sm text-slate-400">Live queue display</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-3xl font-black">{formatTime(now)}</p>
            <p className="text-sm text-slate-400">{formatDate(now)}</p>
          </div>
          <button onClick={lockDisplay} title="Lock queue display" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white">
            <MdLock />
          </button>
        </div>
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Now Serving</p>
          {queue.serving ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-[32px] bg-sky-500/15 text-5xl font-black text-sky-300">
                {queue.serving.queueNo}
              </div>
              <p className="text-xl font-black">{typeLabel(queue.serving.type)}</p>
              <p className="mt-2 text-sm text-slate-300">{queue.serving.doctor}</p>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400">No patient is currently being served.</div>
          )}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-lg font-bold">Waiting Queue</p>
              <p className="text-sm text-slate-400">{queue.waiting?.length || 0} patient(s) waiting</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {connected ? <MdWifi className="text-emerald-400" /> : <MdWifiOff className="text-red-400" />}
              <span className={connected ? 'text-slate-300' : 'text-red-300'}>{connected ? 'Live' : 'Reconnecting…'}</span>
            </div>
          </div>

          <div className="space-y-3">
            {queue.waiting?.length ? queue.waiting.map((entry, index) => (
              <div key={`${entry.queueNo}-${entry.arrivedAt || index}`} className={`rounded-2xl border px-4 py-3 ${index === 0 ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-200">{typeLabel(entry.type)}</p>
                    <p className="mt-1 text-xs text-slate-500">Arrived {entry.arrivedAt || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-sky-300">{entry.queueNo}</p>
                    {index === 0 && <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Up next</p>}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">Queue is empty.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default QueueDisplay
