import { useEffect, useRef } from 'react'
import { normalizeClinicEvent } from '../utils/clinicLiveEvents.mjs'
import { queryClient } from '../lib/queryClient.js'

export function useSSE(role, userId, onMessage) {
  const listener=useRef(onMessage)
  listener.current=onMessage
  useEffect(() => {
    if (!role || !userId) return undefined

    let es
    let retryTimeout
    let closed=false
    let retries=0
    let connected=false
    const dispatch=(eventName,data={})=>{
      const topic=normalizeClinicEvent(eventName)
      window.dispatchEvent(new CustomEvent('clinic:refresh',{detail:{eventName:topic,data}}))
      if(topic!=='notifications.updated')queryClient.invalidateQueries({predicate:q=>{const key=q.queryKey||[];return key.some(v=>['appointments','inventory','schedules','services','promotions','billing','dashboard'].includes(v))}}).catch(()=>{})
    }

    const connect = () => {
      if(closed)return
      es = new EventSource(`/api/events/${encodeURIComponent(role)}`, { withCredentials: true })
      es.onopen=()=>{if(closed)return;const wasReconnect=connected||retries>0;connected=true;retries=0;if(wasReconnect)dispatch('stream.reconnected')}

      es.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data)
          listener.current?.(event, data)
          dispatch(event,data)
        } catch (error) {
          console.error('Failed to parse SSE payload', error)
        }
      }

      es.onerror = () => {
        es?.close()
        if(closed)return
        retries+=1
        const delay=Math.min(30000,1000*2**Math.min(retries,5))
        retryTimeout = window.setTimeout(connect,delay)
      }
    }

    connect()

    return () => {
      closed=true
      es?.close()
      window.clearTimeout(retryTimeout)
    }
  }, [role, userId])
}

