import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdCheck,
  MdClose,
  MdCalendarToday,
  MdInventory2,
  MdLocalPharmacy,
  MdScience,
  MdCleaningServices,
  MdCategory,
  MdPerson,
  MdRefresh,
  MdSearch,
  MdOutlinePendingActions,
  MdOutlineInventory2,
} from 'react-icons/md'

const STATUS_CFG = {
  pending: {
    label: 'Pending',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    stripe: 'bg-amber-400',
  },
  approved: {
    label: 'Approved',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    stripe: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    stripe: 'bg-rose-500',
  },
}

const CATEGORY_CFG = {
  Derma: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', Icon: MdScience },
  Medicine: { bg: 'bg-sky-50', text: 'text-sky-700', Icon: MdLocalPharmacy },
  Supplies: { bg: 'bg-slate-100', text: 'text-slate-600', Icon: MdCleaningServices },
}

const TABS = ['all', 'pending', 'approved', 'rejected']

const DEFAULT_THEME = {
  accentBg: 'bg-sky-600',
  accentSoft: 'bg-sky-50',
  accentBorder: 'border-sky-200',
  accentText: 'text-sky-700',
  accentButton: 'bg-sky-600 hover:bg-sky-700',
  accentRing: 'focus:ring-sky-200 focus:border-sky-400',
  accentIconBg: 'bg-sky-100',
  accentIconText: 'text-sky-700',
}

const getCategory = (category) => CATEGORY_CFG[category] || {
  bg: 'bg-slate-100',
  text: 'text-slate-600',
  Icon: MdCategory,
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const SupplyRequestReviewPanel = ({
  title = 'Supply Requests',
  subtitle = 'Review doctor requests and resolve them from one place.',
  getRequests,
  resolveRequest,
  theme = DEFAULT_THEME,
  compact = false,
}) => {
  const mergedTheme = { ...DEFAULT_THEME, ...theme }
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRequests()
      setRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load supply requests.' })
    } finally {
      setLoading(false)
    }
  }, [getRequests])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(null), 3500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const handleResolve = async (id, status) => {
    setResolving(id)
    try {
      await resolveRequest(id, status)
      setRequests((prev) => prev.map((request) => (
        request.id === id ? { ...request, status } : request
      )))
      setFeedback({
        type: 'success',
        message: `Request ${status === 'approved' ? 'approved' : 'rejected'} successfully.`,
      })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to resolve request.' })
    } finally {
      setResolving(null)
    }
  }

  const counts = useMemo(() => TABS.reduce((acc, tab) => {
    acc[tab] = tab === 'all' ? requests.length : requests.filter((request) => request.status === tab).length
    return acc
  }, {}), [requests])

  const pendingCount = counts.pending || 0

  const filtered = useMemo(() => requests.filter((request) => {
    const matchFilter = filter === 'all' || request.status === filter
    const needle = search.trim().toLowerCase()
    const matchSearch = !needle ||
      request.item_name?.toLowerCase().includes(needle) ||
      request.doctor_name?.toLowerCase().includes(needle) ||
      request.reason?.toLowerCase().includes(needle) ||
      request.category?.toLowerCase().includes(needle)
    return matchFilter && matchSearch
  }), [requests, filter, search])

  if (loading) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <div className={`h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-current ${mergedTheme.accentText}`} />
        </div>
      </section>
    )
  }

  return (
    <section className={`rounded-[28px] border border-slate-200 bg-white shadow-sm ${compact ? 'p-5' : 'p-6'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] ${mergedTheme.accentBorder} ${mergedTheme.accentSoft} ${mergedTheme.accentText}`}>
            <MdOutlineInventory2 className="text-sm" />
            Admin and Staff Review
          </div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <MdRefresh className="text-lg" />
          Refresh
        </button>
      </div>

      {feedback && (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
          feedback.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className={`mt-5 grid gap-3 ${compact ? 'md:grid-cols-3' : 'sm:grid-cols-3'}`}>
        {[
          { label: 'Pending', value: counts.pending || 0, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Approved', value: counts.approved || 0, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Rejected', value: counts.rejected || 0, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border px-4 py-4 ${card.tone}`}>
            <p className="text-2xl font-black">{card.value}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em]">{card.label}</p>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-4 ${mergedTheme.accentBorder} ${mergedTheme.accentSoft}`}>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${mergedTheme.accentIconBg}`}>
            <MdOutlinePendingActions className={`text-xl ${mergedTheme.accentIconText}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {pendingCount} pending request{pendingCount !== 1 ? 's' : ''} still waiting for action
            </p>
            <p className="mt-1 text-xs text-slate-500">Resolve pending requests here so doctors and stock records stay in sync.</p>
          </div>
        </div>
      )}

      <div className={`mt-5 grid gap-3 ${compact ? 'lg:grid-cols-[1fr_auto]' : 'md:grid-cols-[1fr_auto]'}`}>
        <div className="relative">
          <MdSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, doctor, category, or reason"
            className={`w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition ${mergedTheme.accentRing}`}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold capitalize transition ${
                filter === tab
                  ? `${mergedTheme.accentButton} text-white`
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${filter === tab ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>
                {counts[tab] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <MdInventory2 className="mx-auto text-4xl text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No matching requests</p>
          <p className="mt-1 text-xs text-slate-400">Try a different status filter or search term.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((request) => {
            const status = STATUS_CFG[request.status] || STATUS_CFG.pending
            const category = getCategory(request.category)
            const CategoryIcon = category.Icon
            const isResolving = resolving === request.id

            return (
              <article key={request.id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <div className={`h-1 w-full ${status.stripe}`} />
                <div className="p-4 md:p-5">
                  <div className="flex flex-wrap items-start gap-3 md:gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${category.bg}`}>
                      <CategoryIcon className={`text-xl ${category.text}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{request.item_name}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] ${status.badge}`}>
                          {status.label}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {request.category || 'Uncategorized'}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                          <MdPerson className="text-slate-400" />
                          <span>{request.doctor_name || 'Doctor'}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                          <MdInventory2 className="text-slate-400" />
                          <span>{request.qty_requested} {request.unit}(s)</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                          <MdCalendarToday className="text-slate-400" />
                          <span>{formatDate(request.requested_at)}</span>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Reason</p>
                        <p className="mt-1 text-sm text-slate-600">{request.reason || 'No reason provided.'}</p>
                      </div>
                    </div>
                  </div>

                  {request.status === 'pending' ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => handleResolve(request.id, 'approved')}
                        disabled={isResolving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {isResolving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /> : <MdCheck className="text-lg" />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleResolve(request.id, 'rejected')}
                        disabled={isResolving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        <MdClose className="text-lg" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-right text-xs font-medium text-slate-400">
                      Status updated: {status.label}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default SupplyRequestReviewPanel
