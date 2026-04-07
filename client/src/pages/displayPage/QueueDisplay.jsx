// client/src/pages/displayPage/QueueDisplay.jsx
// FIXED: Connected to /api/queue/live (no proxy rewrite — see vite.config.js fix)
// NEW: Sound notification when a new patient number is called
// NEW: Reconnecting state properly handled with retry

import { useState, useEffect, useRef, useCallback } from 'react'
import { MdFace, MdMedicalServices, MdAccessTime, MdPerson, MdWifi, MdWifiOff, MdVolumeUp } from 'react-icons/md'
import logo from '../../assets/logo.png'

// ── Helpers ───────────────────────────────────────────────────────────────────

function useCurrentTime() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return time
}

function formatTime(date) {
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(date) {
  return date.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function estimateWait(position) {
  const mins = position * 15
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

// Play a pleasant two-tone chime using Web Audio API
function playCallSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()

    const playTone = (freq, startTime, duration) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.45, startTime + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    // Two-tone chime: higher note then lower
    playTone(880, ctx.currentTime,        0.5)
    playTone(660, ctx.currentTime + 0.35, 0.6)
  } catch {
    // Silently ignore if audio is not available
  }
}

// ── Queue Display ─────────────────────────────────────────────────────────────

const QueueDisplay = () => {
  const [queue,       setQueue]       = useState({ serving: null, waiting: [], clinicOpen: true })
  const [connected,   setConnected]   = useState(true)
  const [soundEnabled,setSoundEnabled]= useState(true)
  const prevQueueNoRef                = useRef(null)
  const hasInteractedRef              = useRef(false) // browsers need user gesture for audio
  const now = useCurrentTime()

  const fetchQueue = useCallback(async () => {
    try {
      const res  = await fetch('/api/queue/live')
      if (!res.ok) throw new Error('Bad response')
      const data = await res.json()
      setQueue(data)
      setConnected(true)

      // Play sound if a new patient number is being called
      const newQueueNo = data.serving?.queueNo ?? null
      if (
        soundEnabled &&
        hasInteractedRef.current &&
        newQueueNo !== null &&
        newQueueNo !== prevQueueNoRef.current
      ) {
        playCallSound()
      }
      prevQueueNoRef.current = newQueueNo
    } catch {
      setConnected(false)
    }
  }, [soundEnabled])

  // Fetch immediately on mount, then every 10 seconds
  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // Mark that user has interacted (required by browsers for autoplay)
  const handleInteraction = () => {
    hasInteractedRef.current = true
  }

  const { serving, waiting, clinicOpen } = queue

  return (
    <div
      className="min-h-screen bg-[#0b1a2c] text-white flex flex-col select-none overflow-hidden"
      onClick={handleInteraction}
    >

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-10 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Carait Clinic"
            className="w-12 h-12 object-contain bg-white/10 rounded-2xl p-1.5" />
          <div>
            <p className="text-white font-bold text-lg leading-tight tracking-tight">
              Carait Medical and Dermatology Clinic
            </p>
            <p className="text-slate-400 text-sm">Patient Queue Display</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {/* Sound toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); hasInteractedRef.current = true; setSoundEnabled(s => !s) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors
              ${soundEnabled
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                : 'bg-white/5 border-white/10 text-slate-500'}`}
            title="Toggle notification sound">
            <MdVolumeUp className="text-[14px]" />
            {soundEnabled ? 'Sound On' : 'Sound Off'}
          </button>
          <div className="text-right">
            <p className="text-white text-3xl font-black tabular-nums tracking-tight">
              {formatTime(now)}
            </p>
            <p className="text-slate-400 text-sm mt-0.5">{formatDate(now)}</p>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex gap-6 p-8">

        {/* LEFT — Now Serving */}
        <div className="flex-1 flex flex-col">

          {/* Now Serving panel */}
          <div className={`rounded-3xl border-2 p-8 flex flex-col items-center text-center mb-6 flex-shrink-0 transition-all duration-500
            ${serving ? 'bg-sky-500/10 border-sky-400/40' : 'bg-white/5 border-white/10'}`}>
            <p className="text-sky-400 text-sm font-bold uppercase tracking-[0.2em] mb-4">Now Serving</p>

            {serving ? (
              <>
                <div className="w-28 h-28 rounded-3xl bg-sky-400/20 border-2 border-sky-400/40
                  flex items-center justify-center mb-5 animate-pulse">
                  <p className="text-sky-300 text-5xl font-black">{serving.queueNo}</p>
                </div>
                <p className="text-white text-3xl font-black mb-1">{serving.patient}</p>
                <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                  {serving.type === 'derma'
                    ? <MdFace className="text-emerald-400 text-[16px]" />
                    : <MdMedicalServices className="text-blue-400 text-[16px]" />}
                  <span className={serving.type === 'derma' ? 'text-emerald-400' : 'text-blue-400'}>
                    {serving.type === 'derma' ? 'Dermatology' : 'General Medicine'}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span>{serving.doctor}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-3">
                  <MdAccessTime className="text-[12px]" />
                  <span>Arrived {serving.arrivedAt}</span>
                </div>
              </>
            ) : (
              <div className="py-8">
                <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 mx-auto">
                  <MdPerson className="text-slate-600 text-[32px]" />
                </div>
                <p className="text-slate-500 text-lg font-medium">No patient currently being served</p>
                <p className="text-slate-600 text-sm mt-1">Please wait for your number to be called</p>
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'In Queue',  value: waiting.length,                                              color: 'text-amber-400' },
              { label: 'Est. Wait', value: waiting.length > 0 ? estimateWait(1) : '—',                 color: 'text-sky-400'   },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-center">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>

          {/* Sound hint — shown on first load */}
          {!hasInteractedRef.current && (
            <p className="mt-4 text-center text-slate-600 text-xs">
              Click anywhere on this screen to enable sound notifications
            </p>
          )}
        </div>

        {/* RIGHT — Waiting list */}
        <div className="w-[420px] flex flex-col shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-3xl flex flex-col overflow-hidden flex-1">
            <div className="px-6 py-5 border-b border-white/5">
              <p className="text-white font-bold text-base">Upcoming Patients</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {waiting.length} patient{waiting.length !== 1 ? 's' : ''} in queue
              </p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {waiting.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-slate-500 text-sm">Queue is empty</p>
                  <p className="text-slate-600 text-xs mt-1">Walk-ins welcome at the front desk</p>
                </div>
              ) : waiting.map((entry, idx) => (
                <div key={entry.queueNo}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors
                    ${idx === 0 ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0
                    ${idx === 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                    {entry.queueNo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate ${idx === 0 ? 'text-white' : 'text-slate-300'}`}>
                      {entry.patient}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.type === 'derma'
                        ? <MdFace className="text-emerald-400 text-[11px]" />
                        : <MdMedicalServices className="text-blue-400 text-[11px]" />}
                      <p className={`text-xs ${entry.type === 'derma' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {idx === 0 ? "You're next!" : estimateWait(idx + 1)}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      <MdAccessTime className="inline text-[10px] mr-0.5" />
                      {entry.arrivedAt}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="px-10 py-4 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${clinicOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <p className="text-slate-500 text-xs">
            {clinicOpen
              ? 'Clinic is open — Please proceed to the front desk for assistance'
              : 'Clinic is currently closed'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {connected
              ? <MdWifi    className="text-emerald-400 text-[13px]" />
              : <MdWifiOff className="text-red-400    text-[13px]" />}
            <p className={`text-xs ${connected ? 'text-slate-600' : 'text-red-400'}`}>
              {connected ? 'Live' : 'Reconnecting…'}
            </p>
          </div>
          <p className="text-slate-600 text-xs">Updates every 10 seconds · Carait Medical and Dermatology Clinic</p>
        </div>
      </footer>
    </div>
  )
}

export default QueueDisplay