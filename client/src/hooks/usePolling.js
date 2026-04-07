// client/src/hooks/usePolling.js
// Reusable polling hook.  Calls `fn` immediately on mount, then every `intervalMs`.
// Pauses when the browser tab is hidden (document.visibilityState === 'hidden')
// so we don't spam the server for a tab the user isn't looking at.
// Stops automatically on unmount.
//
// Usage:
//   usePolling(loadData, 30_000)          // refresh every 30 s
//   usePolling(loadData, 15_000, !ready)  // skip until `ready` is true

import { useEffect, useRef, useCallback } from 'react'

const usePolling = (fn, intervalMs = 30_000, skip = false) => {
  const savedFn  = useRef(fn)
  const timerId  = useRef(null)

  // Keep ref in sync with latest fn so the interval always calls the newest closure
  useEffect(() => { savedFn.current = fn }, [fn])

  const run = useCallback(() => {
    if (skip) return
    if (document.visibilityState === 'hidden') return
    savedFn.current()
  }, [skip])

  useEffect(() => {
    if (skip) return

    // Immediate first call
    savedFn.current()

    // Schedule repeating calls
    timerId.current = setInterval(run, intervalMs)

    // Pause / resume on tab visibility change
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible — run immediately then keep interval
        savedFn.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(timerId.current)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [run, intervalMs, skip])
}

export default usePolling