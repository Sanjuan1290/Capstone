import { useCallback, useEffect, useState } from 'react'
import { MdLock, MdPointOfSale, MdRefresh, MdPayments, MdReceiptLong } from 'react-icons/md'
import Modal from '../ui/Modal'
import { useToast } from '../ui/ToastProvider'
import { formatMoney } from '../../utils/billingUi'

const formatTime = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '')

// End-of-day cash count for the signed-in cashier. Expected cash = cash payments this
// cashier received today minus cash refunds given against them. After closing, the
// server refuses new payments from this cashier until an administrator reopens it.
const CashierDrawerCard = ({ loadDrawer, closeDrawer }) => {
  const toast = useToast()
  const [drawer, setDrawer] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setDrawer(await loadDrawer())
    } catch (err) {
      setError(err.message || 'Could not load your cash drawer.')
    }
  }, [loadDrawer])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  const closing = drawer?.closing || null
  const isClosed = closing?.status === 'closed'
  const expected = Number(drawer?.expected_cash || 0)
  const countedNumber = counted === '' ? null : Number(counted)
  const variance = countedNumber === null || !Number.isFinite(countedNumber) ? null : Math.round((countedNumber - expected) * 100) / 100
  const needsNote = variance !== null && Math.abs(variance) >= 0.01

  const submit = async () => {
    if (countedNumber === null || !Number.isFinite(countedNumber) || countedNumber < 0) return
    if (needsNote && !notes.trim()) return
    setSaving(true)
    try {
      const result = await closeDrawer({ actual_cash: countedNumber, notes: notes.trim() || null })
      setDrawer(result)
      setOpen(false)
      toast.success('Cash drawer closed for today.')
    } catch (err) {
      toast.error(err.message || 'Could not close the cash drawer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <MdPointOfSale className="mt-1 text-2xl text-emerald-600" />
          <div>
            <h2 className="font-black text-slate-900">Cash Drawer · Today</h2>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${isClosed ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{isClosed ? 'Closed' : 'Open for collections'}</span>
            {error ? <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p> : (
              <p className="mt-1 text-xs text-slate-500">
                {drawer ? `${drawer.transactions} payment${drawer.transactions === 1 ? '' : 's'} received · ${formatMoney(drawer.non_cash_collected)} non-cash${Number(drawer.cash_refunds || 0) > 0 ? ` · ${formatMoney(drawer.cash_refunds)} cash refunded` : ''}` : 'Loading…'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400">Expected cash</p>
            <p className="text-2xl font-black text-slate-900">{formatMoney(expected)}</p>
          </div>
          <button type="button" className="button-secondary px-3" onClick={load} aria-label="Refresh cash drawer"><MdRefresh /></button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-xs text-slate-500"><MdReceiptLong /> Transactions</p><p className="mt-1 text-lg font-bold text-slate-900">{drawer?.transactions ?? '—'}</p></div>
        <div className="rounded-xl bg-sky-50 p-3"><p className="flex items-center gap-1.5 text-xs text-sky-700"><MdPayments /> Non-cash collected</p><p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(drawer?.non_cash_collected || 0)}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Cash refunds</p><p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(drawer?.cash_refunds || 0)}</p></div>
      </div>
      {isClosed ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-bold text-slate-700"><MdLock /> Closed at {formatTime(closing.closed_at)} with {formatMoney(closing.actual_cash)} counted</p>
          <p className={`font-black ${Number(closing.variance) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {Number(closing.variance) === 0 ? 'Balanced' : `${Number(closing.variance) < 0 ? 'Short' : 'Over'} ${formatMoney(Math.abs(Number(closing.variance)))}`}
          </p>
          <p className="w-full text-xs text-slate-500">New payments are blocked for your account today. Ask an administrator to reopen the drawer if you need to take another payment.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {closing?.status === 'reopened' ? `Reopened by an administrator${closing.reopen_reason ? `: ${closing.reopen_reason}` : ''}. Count again before you leave.` : 'At the end of your shift, count the cash in your drawer and record it here.'}
          </p>
          <button type="button" className="button-primary" disabled={!drawer} onClick={() => { setCounted(''); setNotes(''); setOpen(true) }}>Close My Drawer</button>
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} closeDisabled={saving} title="Close Cash Drawer" description="Count the physical cash and enter the total." size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Expected cash</span>
            <strong className="text-lg text-slate-900">{formatMoney(expected)}</strong>
          </div>
          <label className="block">
            <span className="form-label">Counted cash *</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className="form-control mt-1.5 text-lg font-bold" placeholder="0.00" autoFocus />
          </label>
          {variance !== null && (
            <p className={`rounded-xl px-3 py-2 text-sm font-bold ${variance === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {variance === 0 ? 'Drawer balances.' : `Drawer is ${variance < 0 ? 'short' : 'over'} by ${formatMoney(Math.abs(variance))}.`}
            </p>
          )}
          <label className="block">
            <span className="form-label">{needsNote ? 'Explain the difference *' : 'Notes'}</span>
            <textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-control mt-1.5 resize-none" />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="button-primary" disabled={saving || countedNumber === null || !Number.isFinite(countedNumber) || countedNumber < 0 || (needsNote && !notes.trim())} onClick={submit}>
              {saving ? 'Closing…' : 'Close Drawer'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

export default CashierDrawerCard


