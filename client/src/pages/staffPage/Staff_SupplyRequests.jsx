import { useEffect, useState } from 'react'
import {
  MdInventory2, MdCheck, MdClose, MdRefresh,
  MdPerson, MdLocalPharmacy, MdScience, MdCleaningServices, MdCategory,
  MdCalendarToday, MdFilterList
} from 'react-icons/md'

const STATUS_CFG = {
  pending:  { label: "Pending",  badge: "bg-amber-50   text-amber-700   border-amber-200"    },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
  rejected: { label: "Rejected", badge: "bg-red-50     text-red-500     border-red-200"      },
}

const getCategoryIcon = (cat) => ({
  Derma:    MdScience,
  Medicine: MdLocalPharmacy,
  Supplies: MdCleaningServices,
})[cat] || MdCategory

const Staff_SupplyRequests = () => {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState("pending")
  const [resolving, setResolving] = useState(null) // id of request being resolved

  const load = () => {
    setLoading(true)
    fetch('/api/staff/supply-requests', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (id, status) => {
    setResolving(id)
    try {
      const res  = await fetch(`/api/staff/supply-requests/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch {
      alert('Failed to update request. Please try again.')
    } finally {
      setResolving(null)
    }
  }

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter)

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supply Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Doctor supply requests — review and approve or reject them.</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 border border-slate-200 text-slate-600 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
          <MdRefresh className={`text-[15px] ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {[
          { key: "all",      label: "All"      },
          { key: "pending",  label: "Pending"  },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
              ${filter === key ? "bg-[#0b1a2c] text-sky-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
              ${filter === key ? "bg-white/10 text-sky-300" : "bg-slate-100 text-slate-400"}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Pending banner */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <MdInventory2 className="text-amber-500 text-[20px] shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {counts.pending} pending request{counts.pending !== 1 ? 's' : ''} awaiting review
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Review and approve or reject each request below.
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-20 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <MdInventory2 className="text-[26px] text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">No {filter === 'all' ? '' : filter} requests</p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === 'pending' ? 'All requests have been resolved.' : 'Nothing to show here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {/* Table head */}
          <div className="grid grid-cols-[40px_2fr_1fr_80px_80px_100px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["","Item","Doctor","Qty","Status",""].map((h, i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>

          {filtered.map(req => {
            const cfg     = STATUS_CFG[req.status] || STATUS_CFG.pending
            const CatIcon = getCategoryIcon(req.category)
            const isBeingResolved = resolving === req.id
            const reqDate = req.requested_at
              ? new Date(req.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
              : "—"

            return (
              <div key={req.id}
                className="grid grid-cols-[40px_2fr_1fr_80px_80px_100px] gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors">

                {/* Category icon */}
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <CatIcon className="text-slate-400 text-[16px]" />
                </div>

                {/* Item info */}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{req.item_name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <MdCalendarToday className="text-[10px]" /> {reqDate}
                    {req.reason && <span className="ml-1 truncate">· "{req.reason}"</span>}
                  </p>
                </div>

                {/* Doctor */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <MdPerson className="text-slate-400 text-[13px] shrink-0" />
                  <p className="text-xs text-slate-600 font-medium truncate">{req.doctor_name}</p>
                </div>

                {/* Qty */}
                <p className="text-sm font-bold text-slate-800">
                  {req.qty_requested}
                  <span className="text-xs font-normal text-slate-400 ml-1">{req.unit}s</span>
                </p>

                {/* Status badge */}
                <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full w-fit ${cfg.badge}`}>
                  {cfg.label}
                </span>

                {/* Actions */}
                <div className="flex gap-1.5 justify-end">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleResolve(req.id, 'approved')}
                        disabled={isBeingResolved}
                        title="Approve"
                        className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors disabled:opacity-40">
                        {isBeingResolved
                          ? <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          : <MdCheck className="text-emerald-600 text-[14px]" />
                        }
                      </button>
                      <button
                        onClick={() => handleResolve(req.id, 'rejected')}
                        disabled={isBeingResolved}
                        title="Reject"
                        className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors disabled:opacity-40">
                        <MdClose className="text-red-500 text-[14px]" />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">Resolved</span>
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