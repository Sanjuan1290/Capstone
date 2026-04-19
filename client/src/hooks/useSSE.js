import { useEffect } from 'react'

export function useSSE(role, userId, onMessage) {
  useEffect(() => {
    if (!role || !userId) return undefined

    let es
    let retryTimeout

    const connect = () => {
      es = new EventSource(`/api/events?role=${encodeURIComponent(role)}&userId=${encodeURIComponent(userId)}`)

      es.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data)
          onMessage?.(event, data)
        } catch (error) {
          console.error('Failed to parse SSE payload', error)
        }
      }

      es.onerror = () => {
        es?.close()
        retryTimeout = window.setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      es?.close()
      window.clearTimeout(retryTimeout)
    }
  }, [role, userId, onMessage])
}
