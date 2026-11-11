// Refresh data without refreshing the entire browser page.
// Prevent overlapping requests, rapid duplicate refreshes and hidden-tab traffic.
import { useEffect, useRef, useCallback } from 'react'

const usePolling = (fn, intervalMs = 30_000, skip = false) => {
  const savedFn = useRef(fn)
  const busy = useRef(false)
  const lastCall = useRef(0)
  const timer = useRef(null)
  useEffect(() => { savedFn.current = fn }, [fn])

  const run = useCallback(() => {
    if (skip || document.visibilityState === 'hidden' || busy.current) return
    const now = Date.now()
    if (now - lastCall.current < 1500) return // SSE events may arrive together.
    lastCall.current = now
    busy.current = true
    try {
      // Catch failures here only to release the lock. Existing loaders handle UI errors.
      Promise.resolve(savedFn.current()).catch(() => {}).finally(() => { busy.current = false })
    } catch {
      busy.current = false
    }
  }, [skip])

  useEffect(() => {
    if (skip) return undefined
    run()
    timer.current = window.setInterval(run, Math.max(5000, Number(intervalMs) || 30000))
    const onVisibility = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('clinic:refresh', run)
    return () => {
      window.clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('clinic:refresh', run)
    }
  }, [intervalMs, run, skip])
}
export default usePolling
