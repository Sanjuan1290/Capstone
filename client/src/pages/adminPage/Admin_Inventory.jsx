import { useCallback, useEffect, useState } from 'react'
import { MdRefresh } from 'react-icons/md'
import Inventory from '../shared/Inventory'
import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import {
  addInventoryItem,
  deleteInventoryItem,
  getInventory,
  getInventoryLogs,
  getSupplyRequests,
  resolveSupplyRequest,
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

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const rows = await getInventoryLogs()
      setLogs(Array.isArray(rows) ? rows : [])
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    const refresh = () => loadLogs()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [loadLogs])

  return (
    <div className="space-y-6">
      <Inventory services={adminServices} />

      <SupplyRequestReviewPanel
        title="Supply Request Oversight"
        subtitle="Admin can review and resolve doctor supply requests alongside inventory activity."
        getRequests={getSupplyRequests}
        resolveRequest={resolveSupplyRequest}
        theme={{
          accentBg: 'bg-amber-600',
          accentSoft: 'bg-amber-50',
          accentBorder: 'border-amber-200',
          accentText: 'text-amber-700',
          accentButton: 'bg-amber-600 hover:bg-amber-700',
          accentRing: 'focus:ring-amber-200 focus:border-amber-400',
          accentIconBg: 'bg-amber-100',
          accentIconText: 'text-amber-700',
        }}
        compact
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Audit Log</h2>
            <p className="mt-1 text-sm text-slate-500">Last 100 inventory movements and admin actions, newest first.</p>
          </div>
          <button onClick={loadLogs} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <MdRefresh /> Refresh
          </button>
        </div>

        {loadingLogs ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">No inventory log entries yet.</div>
        ) : (
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
        )}
      </section>
    </div>
  )
}

export default AdminInventory
