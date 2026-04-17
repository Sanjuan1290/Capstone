import { useEffect, useState } from 'react'
import { MdNotifications, MdDone } from 'react-icons/md'
import { getNotifications, markNotificationRead } from '../services/portal.service'

const NotificationBell = ({ role }) => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!role) return
    let mounted = true

    const load = async () => {
      try {
        const data = await getNotifications(role)
        if (!mounted) return
        setItems(data.items || [])
        setUnread(data.unread || 0)
      } catch {}
    }

    load()
    const timer = setInterval(load, 20000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [role])

  const handleRead = async (id) => {
    try {
      await markNotificationRead(role, id)
      setItems(prev => prev.map(item => item.id === id ? { ...item, is_read: 1 } : item))
      setUnread(prev => Math.max(0, prev - 1))
    } catch {}
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <MdNotifications className="text-[18px] mx-auto" />
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Notifications</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">No notifications yet.</p>
            ) : items.map(item => (
              <div key={item.id} className={`px-4 py-3 border-b border-slate-100 last:border-0 ${item.is_read ? 'bg-white' : 'bg-sky-50/50'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2">{new Date(item.created_at).toLocaleString('en-PH')}</p>
                  </div>
                  {!item.is_read && (
                    <button onClick={() => handleRead(item.id)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-sky-600 hover:border-sky-200">
                      <MdDone className="text-[16px] mx-auto" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
