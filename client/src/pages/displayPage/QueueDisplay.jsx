import { useCallback, useEffect, useRef, useState } from 'react'
import { MdVolumeUp, MdWifi, MdWifiOff } from 'react-icons/md'
import logo from '../../assets/logo.png'

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

const QueueDisplay = () => {
  const [queue, setQueue] = useState({ serving: null, waiting: [], clinicOpen: true })
  const [connected, setConnected] = useState(true)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const audioContextRef = useRef(null)
  const previousWaitingLengthRef = useRef(0)
  const now = useCurrentTime()

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

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/queue/live')
      const data = await response.json()
      setQueue(data)
      setConnected(true)

      if (isMonitoring && data.waiting?.length > previousWaitingLengthRef.current) {
        playChime()
      }
      previousWaitingLengthRef.current = data.waiting?.length || 0
    } catch {
      setConnected(false)
    }
  }, [isMonitoring, playChime])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      fetchQueue()
    }, 0)
    const timer = window.setInterval(fetchQueue, 10000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [fetchQueue])

  const startMonitoring = async () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      setIsMonitoring(true)
      return
    }

    if (!audioContextRef.current) audioContextRef.current = new AudioCtx()
    await audioContextRef.current.resume()
    setIsMonitoring(true)
  }

  return (
    <div className="min-h-screen bg-[#0b1a2c] px-4 py-6 text-white md:px-8">
      {!isMonitoring && (
        <div className="mx-auto mb-6 max-w-4xl rounded-3xl border border-sky-400/30 bg-sky-500/10 p-6 text-center">
          <p className="mb-3 text-lg font-bold">Start Queue Monitor</p>
          <p className="mb-4 text-sm text-sky-100">Click once to unlock browser audio so queue chimes can play when new entries appear.</p>
          <button onClick={startMonitoring} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-sky-700">
            <MdVolumeUp /> Start Queue Monitor
          </button>
        </div>
      )}

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Carait Clinic" className="h-14 w-14 rounded-2xl bg-white/10 p-2" />
          <div>
            <h1 className="text-xl font-black tracking-tight">Carait Medical and Dermatology Clinic</h1>
            <p className="text-sm text-slate-400">Live queue display</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black">{formatTime(now)}</p>
          <p className="text-sm text-slate-400">{formatDate(now)}</p>
        </div>
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Now Serving</p>
          {queue.serving ? (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-[32px] bg-sky-500/15 text-6xl font-black text-sky-300">
                {queue.serving.queueNo}
              </div>
              <p className="text-3xl font-black">{queue.serving.patient}</p>
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
              <span className={connected ? 'text-slate-300' : 'text-red-300'}>{connected ? 'Live' : 'Reconnecting...'}</span>
            </div>
          </div>

          <div className="space-y-3">
            {queue.waiting?.length ? queue.waiting.map((entry, index) => (
              <div key={entry.queueNo} className={`rounded-2xl border px-4 py-3 ${index === 0 ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{entry.patient}</p>
                    <p className="text-sm text-slate-400">{entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-sky-300">{entry.queueNo}</p>
                    <p className="text-xs text-slate-400">{entry.arrivedAt}</p>
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
