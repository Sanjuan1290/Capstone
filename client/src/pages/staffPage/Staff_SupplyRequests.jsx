// client/src/pages/staffPage/Staff_SupplyRequests.jsx
// REDESIGNED: Card layout, mobile-first, status tabs, approve/reject inline

import { useEffect, useState } from 'react'
import { getSupplyRequests, resolveSupplyRequest } from '../../services/staff.service'
import {
  MdInventory2, MdCheck, MdClose, MdRefresh,
  MdLocalPharmacy, MdScience, MdCleaningServices, MdCategory,
  MdPerson, MdCalendarToday,
} from 'react-icons/md'

const STATUS_CFG = {
  pending:  { label: 'Pending',  badge: 'bg-amber-50   text-amber-700  border-amber-200'   },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', badge: 'bg-red-50     text-red-500    border-red-200'     },
}

const CAT_CFG = {
  Derma:    { bg: 'bg-purple-50', text: 'text-purple-600', Icon: MdScience         },
  Medicine: { bg: 'bg-sky-50',    text: 'text-sky-600',    Icon: MdLocalPharmacy   },
  Supplies: { bg: 'bg-slate-100', text: 'text-slate-500',  Icon: MdCleaningServices },
}
const getCat = cat => CAT_CFG[cat] || { bg: 'bg-slate-100', text: 'text-slate-500', Icon: MdCategory }

const TABS = ['all', 'pending', 'approved', 'rejected']

const Staff_SupplyRequests = () => {
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [resolving, setResolving] = useState(null)

  const load = () => {
    setLoading(true)
    getSupplyRequests()
      .then(data => setRequests(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (id, status) => {
    setResolving(id)
    try {
      await resolveSupplyRequest(id, status)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch (err) {
      alert(err.message || 'Failed to resolve.')
    } finally {
      setResolving(null)
    }
  }

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'all' ? requests.length : requests.filter(r => r.status === t).length
    return acc
  }, {})

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const pendingList = requests.filter(r => r.status === 'pending')

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Supply Requests</h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Review and approve doctor supply requests.</p>
        </div>
        <button onClick={load}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
          <MdRefresh className="text-[18px]" />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {['pending','approved','rejected'].map(s => {
          const cfg = STATUS_CFG[s]
          return (
            <div key={s} className={`rounded-2xl border p-4 text-center ${cfg.badge}`}>
              <p className="text-2xl font-black">{counts[s]}</p>
              <p className="text-[11px] font-bold uppercase mt-0.5">{cfg.label}</p>
            </div>
          )
        })}
      </div>

      {/* Pending alert */}
      {pendingList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <MdInventory2 className="text-amber-500 text-[20px] shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {pendingList.length} pending request{pendingList.length !== 1 ? 's' : ''} awaiting review
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Approve or reject each request below.</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all
              ${filter === t ? 'bg-sky-500 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {counts[t] > 0 && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full
                ${filter === t ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center text-center">
          <MdInventory2 className="text-slate-200 text-[36px] mb-3" />
          <p className="text-sm font-semibold text-slate-500">No {filter === 'all' ? '' : filter} requests</p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === 'pending' ? 'All requests have been resolved.' : 'Nothing to show here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CFG[req.status] || STATUS_CFG.pending
            const cat = getCat(req.category)
            const isBeingResolved = resolving === req.id
            const date = req.requested_at
              ? new Date(req.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'

            return (
              <div key={req.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all
                  ${req.status === 'pending' ? 'border-amber-200' : 'border-slate-200'}`}>

                {/* Top color indicator */}
                <div className={`h-1 w-full ${req.status === 'pending' ? 'bg-amber-400' : req.status === 'approved' ? 'bg-emerald-500' : 'bg-red-400'}`} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}>
                      <cat.Icon className={`text-[18px] ${cat.text}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 truncate">{req.item_name}</p>
                        <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium flex-wrap">
                        <span className="flex items-center gap-1">
                          <MdPerson className="text-[11px]" /> {req.doctor_name}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {req.qty_requested} {req.unit}(s) needed
                        </span>
                        <span className="flex items-center gap-1">
                          <MdCalendarToday className="text-[11px]" /> {date}
                        </span>
                      </div>
                      {req.reason && (
                        <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 inline-block">
                          "{req.reason}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {req.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => handleResolve(req.id, 'approved')}
                        disabled={isBeingResolved}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                          text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100
                          rounded-xl transition-colors disabled:opacity-50">
                        {isBeingResolved
                          ? <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          : <><MdCheck className="text-[14px]" /> Approve</>}
                      </button>
                      <button
                        onClick={() => handleResolve(req.id, 'rejected')}
                        disabled={isBeingResolved}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                          text-red-600 bg-red-50 border border-red-200 hover:bg-red-100
                          rounded-xl transition-colors disabled:opacity-50">
                        <MdClose className="text-[14px]" /> Reject
                      </button>
                    </div>
                  )}

                  {req.status !== 'pending' && (
                    <p className="text-[11px] text-slate-400 mt-2 font-medium text-right">
                      Resolved · {date}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Staff_SupplyRequests