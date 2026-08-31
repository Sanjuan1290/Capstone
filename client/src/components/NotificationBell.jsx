import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MdDone, MdNotifications } from 'react-icons/md'
import {
  getNotifications,
  markNotificationRead,
  readAllNotifications,
} from '../services/portal.service'

const NotificationBell = ({ role }) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const queryKey = ['notifications', role]

  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => getNotifications(role),
    enabled: Boolean(role),
    staleTime: 30 * 1000,
  })

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey })
    window.addEventListener('clinic:refresh', refresh)
    window.addEventListener('clinic:notifications-refresh', refresh)
    return () => {
      window.removeEventListener('clinic:refresh', refresh)
      window.removeEventListener('clinic:notifications-refresh', refresh)
    }
  }, [queryClient, role])

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        <MdNotifications className="mx-auto text-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {readAllMutation.isPending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />}
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isPending ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading notifications...</p>
            ) : isError ? (
              <p className="px-4 py-6 text-center text-sm text-red-400">Failed to load notifications.</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`border-b border-slate-100 px-4 py-3 last:border-0 ${item.is_read ? 'bg-white' : 'bg-sky-50/60'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.message}</p>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleString('en-PH')}
                      </p>
                    </div>
                    {!item.is_read && (
                      <button
                        onClick={() => markReadMutation.mutate(item.id)}
                        className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:border-sky-200 hover:text-sky-600"
                      >
                        <MdDone className="mx-auto text-[16px]" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
