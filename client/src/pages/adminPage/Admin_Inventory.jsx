import { useCallback, useEffect, useState } from 'react'
import {
  MdChevronLeft,
  MdChevronRight,
  MdFilterAltOff,
  MdRefresh,
} from 'react-icons/md'
import Inventory from '../shared/Inventory'
import {
  addInventoryItem,
  deleteInventoryItem,
  getInventory,
  getInventoryLogs,
  updateInventoryItem,
  updateStock,
} from '../../services/admin.service'

const adminServices = {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
}

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
}

const formatDateTime = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getTypeTone = (type) => {
  const logType = String(type).toLowerCase()
  if (logType === 'in') return 'bg-emerald-50 text-emerald-700'
  if (logType === 'out') return 'bg-amber-50 text-amber-700'
  if (logType === 'delete') return 'bg-red-50 text-red-700'
  return 'bg-sky-50 text-sky-700'
}

const AdminInventory = () => {
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  })
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION)

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const response = await getInventoryLogs({
        page,
        limit: pagination.limit,
        ...filters,
      })
      setLogs(Array.isArray(response?.items) ? response.items : [])
      setPagination(response?.pagination || DEFAULT_PAGINATION)
    } finally {
      setLoadingLogs(false)
    }
  }, [filters, page, pagination.limit])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    const refresh = () => loadLogs()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [loadLogs])

  const handleFilterChange = (key) => (e) => {
    const value = e.target.value
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleClearFilters = () => {
    setPage(1)
    setFilters({ start_date: '', end_date: '' })
  }

  return (
    <div className="space-y-6">
      <Inventory services={adminServices} />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Audit Log</h2>
            <p className="mt-1 text-sm text-slate-500">
              Browse inventory movements and admin actions with date filters and pagination.
            </p>
          </div>
          <button
            onClick={loadLogs}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <MdRefresh /> Refresh
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <label className="min-w-[180px] flex-1 space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Start Date</span>
            <input
              type="date"
              value={filters.start_date}
              onChange={handleFilterChange('start_date')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
          </label>

          <label className="min-w-[180px] flex-1 space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">End Date</span>
            <input
              type="date"
              value={filters.end_date}
              onChange={handleFilterChange('end_date')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
          </label>

          <button
            onClick={handleClearFilters}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <MdFilterAltOff />
            Clear
          </button>
        </div>

        {loadingLogs ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">
            No inventory log entries found for the selected dates.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <p>
                Showing page <span className="font-semibold text-slate-700">{pagination.page}</span> of{' '}
                <span className="font-semibold text-slate-700">{pagination.totalPages}</span>
                {' '}with <span className="font-semibold text-slate-700">{pagination.total}</span> matching entries.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Date/Time</th>
                    <th className="px-3 py-3">Item Name</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Quantity</th>
                    <th className="px-3 py-3">Performed By</th>
                    <th className="px-3 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 text-sm text-slate-600 last:border-0">
                      <td className="px-3 py-3">{formatDateTime(log.logged_at || log.created_at)}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">{log.item_name || 'Unknown Item'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getTypeTone(log.type)}`}>
                          {String(log.type).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-3">{log.qty}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span>{log.performed_by || 'System'}</span>
                          <span className="text-xs text-slate-400">{log.performed_by_role || 'System'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">{log.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={!pagination.hasPrev}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MdChevronLeft />
                Previous
              </button>

              <button
                onClick={() => setPage(prev => prev + 1)}
                disabled={!pagination.hasNext}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <MdChevronRight />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminInventory
