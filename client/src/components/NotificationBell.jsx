import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MdDone, MdNotifications } from 'react-icons/md'
import {
  getNotifications,
  markNotificationRead,
  readAllNotifications,
} from '../services/portal.service'
import { getNotificationPopoverPosition } from './notificationPopoverPosition.mjs'

const PANEL_WIDTH = 320
const PANEL_HEIGHT = 384
const VIEWPORT_EDGE = 12

const readVisibleViewport = () => {
  const viewport = window.visualViewport
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? document.documentElement.clientWidth,
    height: viewport?.height ?? document.documentElement.clientHeight,
  }
}

const NotificationBell = ({ role }) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()
  const queryKey = useMemo(() => ['notifications', role], [role])

  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => getNotifications(role),
    enabled: Boolean(role),
    staleTime: 30 * 1000,
  })

  useLayoutEffect(() => {
    if (!open) return undefined

    const updatePosition = () => {
      const anchorRect = triggerRef.current?.getBoundingClientRect()
      if (!anchorRect) return
      setPosition(getNotificationPopoverPosition({
        anchorRect,
        viewport: readVisibleViewport(),
        preferredWidth: PANEL_WIDTH,
        preferredHeight: PANEL_HEIGHT,
        edge: VIEWPORT_EDGE,
      }))
    }

    updatePosition()
    panelRef.current?.focus({ preventScroll: true })

    let animationFrame = 0
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updatePosition)
    }
    const closeOnOutsidePointer = (event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const activeElement = document.activeElement
      const activeModal = activeElement?.closest?.('[role="dialog"][aria-modal="true"]')
      if (activeModal && !panelRef.current?.contains(activeElement)) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', schedulePositionUpdate)
    window.addEventListener('scroll', schedulePositionUpdate, true)
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate)
    window.visualViewport?.addEventListener('scroll', schedulePositionUpdate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', schedulePositionUpdate)
      window.removeEventListener('scroll', schedulePositionUpdate, true)
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate)
      window.visualViewport?.removeEventListener('scroll', schedulePositionUpdate)
    }
  }, [open])

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey })
    window.addEventListener('clinic:refresh', refresh)
    window.addEventListener('clinic:notifications-refresh', refresh)
    return () => {
      window.removeEventListener('clinic:refresh', refresh)
      window.removeEventListener('clinic:notifications-refresh', refresh)
    }
  }, [queryClient, queryKey])

  const markReadMutation = useMutation({
    mutationFn: (id) => markNotificationRead(role, id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (current) => {
        if (!current) return current
        const wasUnread = current.items?.some((item) => item.id === id && !item.is_read)
        return {
          ...current,
          items: (current.items || []).map((item) => (item.id === id ? { ...item, is_read: 1 } : item)),
          unread: wasUnread ? Math.max(0, Number(current.unread || 0) - 1) : current.unread,
        }
      })
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      console.error('Failed to mark notification as read', error)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const readAllMutation = useMutation({
    mutationFn: () => readAllNotifications(role),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (current) => (
        current
          ? { ...current, items: (current.items || []).map((item) => ({ ...item, is_read: 1 })), unread: 0 }
          : current
      ))
      return { previous }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      console.error('Failed to mark all notifications as read', error)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const items = data?.items || []
  const unread = Number(data?.unread || 0)
  const fallbackPosition = {
    left: VIEWPORT_EDGE,
    top: 64,
    width: Math.max(0, Math.min(PANEL_WIDTH, window.innerWidth - (VIEWPORT_EDGE * 2))),
    maxHeight: `calc(100dvh - ${VIEWPORT_EDGE * 2}px)`,
    placement: 'below',
  }
  const panelPosition = position || fallbackPosition
  const panel = open && createPortal(
    <section
      id={panelId}
      ref={panelRef}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
      aria-modal="false"
      tabIndex={-1}
      data-notification-popover
      className="fixed z-[70] flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
      style={{
        left: panelPosition.left,
        top: panelPosition.top,
        width: panelPosition.width,
        maxHeight: panelPosition.maxHeight,
        transform: panelPosition.placement === 'above' ? 'translateY(-100%)' : undefined,
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p id={`${panelId}-title`} className="text-sm font-bold text-slate-800">Notifications</p>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {readAllMutation.isPending && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />}
            Mark all as read
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain dark:text-slate-100" role="list" aria-label="Recent notifications">
        {isPending ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Loading notifications...</p>
        ) : isError ? (
          <p className="px-4 py-6 text-center text-sm text-red-400">Failed to load notifications.</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
        ) : (
          items.map((item) => {
            const content = (
              <>
                <span className="block break-words text-sm font-semibold text-slate-800" style={{ overflowWrap: 'anywhere' }}>{item.title}</span>
                <span className="mt-1 block break-words text-xs text-slate-500" style={{ overflowWrap: 'anywhere' }}>{item.message}</span>
                <span className="mt-2 block break-words text-[10px] text-slate-400" style={{ overflowWrap: 'anywhere' }}>
                  {new Date(item.created_at).toLocaleString('en-PH')}
                </span>
              </>
            )

            return (
              <div
                key={item.id}
                role="listitem"
                className={`flex min-w-0 items-start gap-2 border-b border-slate-100 px-4 py-3 last:border-0 ${item.is_read ? 'bg-white dark:bg-slate-900' : 'bg-sky-50/60 dark:bg-sky-950/50'}`}
              >
                {item.link ? (
                  <button
                    type="button"
                    data-notification-item
                    aria-label={`${item.title}: ${item.message}`}
                    onClick={() => {
                      if (!item.is_read) markReadMutation.mutate(item.id)
                      window.location.assign(item.link)
                    }}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">{content}</div>
                )}
                {!item.is_read && (
                  <button
                    type="button"
                    data-notification-item
                    onClick={() => markReadMutation.mutate(item.id)}
                    aria-label={`Mark ${item.title || 'notification'} as read`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-sky-200 hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <MdDone aria-hidden="true" className="text-[16px]" />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>,
    document.body,
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className="relative h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <MdNotifications aria-hidden="true" className="mx-auto text-[18px]" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {panel}
    </div>
  )
}

export default NotificationBell

