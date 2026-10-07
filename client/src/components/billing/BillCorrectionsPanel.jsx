import { useCallback, useEffect, useState } from 'react'
import { MdBlock, MdInventory2, MdKeyboardReturn, MdLockOpen, MdReplay } from 'react-icons/md'
import Modal from '../ui/Modal'
import { useToast } from '../ui/ToastProvider'
import { getBillStockUsage, reopenBill, returnConsultationConsumable, voidBill } from '../../services/admin.service'
import { formatMoney } from '../../utils/billingUi'

const formatQty = (value) => {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

const formatDate = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleString('en-PH') : '')

// Admin-only corrections for one bill. Money must be voided or refunded on the payment
// first; the server enforces that and explains it if a button is pressed too early.
const BillCorrectionsPanel = ({ bill, onBillChanged }) => {
  const toast = useToast()
  const [usage, setUsage] = useState({ consultation: [], checkout: [] })
  const [usageError, setUsageError] = useState('')
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState('')
  const [returnStock, setReturnStock] = useState(true)
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnQty, setReturnQty] = useState('1')
  const [busy, setBusy] = useState(false)

  const loadUsage = useCallback(async () => {
    setUsageError('')
    try {
      setUsage(await getBillStockUsage(bill.id))
    } catch (err) {
      setUsageError(err.message || 'Could not load stock usage for this bill.')
    }
  }, [bill.id])

  useEffect(() => { loadUsage() }, [loadUsage, bill.version, bill.status])

  const heldAmount = Number(bill.paid_amount || 0)
  const moneyHeld = heldAmount > 0.004
  const canReopen = !['draft', 'pending', 'voided'].includes(bill.status)
  const canVoid = bill.status !== 'voided'
  const dispensedLines = usage.checkout.filter((row) => !row.returned)

  const openAction = (kind) => {
    setAction(kind)
    setReason('')
    setReturnStock(true)
  }

  const submitAction = async () => {
    if (reason.trim().length < 5) return
    setBusy(true)
    try {
      const result = action === 'void'
        ? await voidBill(bill.id, { reason: reason.trim(), return_stock: returnStock })
        : await reopenBill(bill.id, { reason: reason.trim() })
      toast.success(result.message || (action === 'void' ? 'Bill voided.' : 'Bill reopened.'))
      setAction(null)
      onBillChanged?.(result)
      loadUsage()
    } catch (err) {
      toast.error(err.message || 'The bill could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const openReturn = (row) => {
    setReturnTarget(row)
    setReturnQty(String(Math.min(1, row.returnable_quantity) || 1))
    setReason('')
  }

  const submitReturn = async () => {
    const qty = Number(returnQty)
    if (!returnTarget || !(qty > 0) || reason.trim().length < 3) return
    setBusy(true)
    try {
      const result = await returnConsultationConsumable(bill.id, returnTarget.usage_batch_id, { quantity: qty, reason: reason.trim() })
      toast.success(result.message || 'Returned to stock.')
      setUsage(result.usage || usage)
      setReturnTarget(null)
    } catch (err) {
      toast.error(err.message || 'Could not return the consumable.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-black text-slate-900">Bill Corrections</h2>
        {bill.status === 'voided' ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <p className="font-bold">This bill was voided{bill.voided_at ? ` on ${formatDate(bill.voided_at)}` : ''}.</p>
            {bill.void_reason && <p className="mt-1 text-xs">Reason: {bill.void_reason}</p>}
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-500">
              Reopen a confirmed bill to fix its charges, or void it entirely. Both need every payment voided or refunded first, so no money is left on the bill.
            </p>
            {moneyHeld && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {formatMoney(heldAmount)} is still recorded as paid. Void or refund the payments below before correcting the bill.
              </p>
            )}
            {Number(bill.reopen_count || 0) > 0 && (
              <p className="mt-3 text-xs text-slate-500">Reopened {bill.reopen_count} time{Number(bill.reopen_count) === 1 ? '' : 's'}{bill.reopen_reason ? `. Last reason: ${bill.reopen_reason}` : ''}</p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              {canReopen && (
                <button type="button" className="button-secondary justify-center" disabled={moneyHeld} onClick={() => openAction('reopen')}>
                  <MdLockOpen /> Reopen as Draft
                </button>
              )}
              {canVoid && (
                <button type="button" className="button-secondary justify-center text-rose-700" disabled={moneyHeld} onClick={() => openAction('void')}>
                  <MdBlock /> Void Bill
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-900"><MdInventory2 className="text-sky-500" /> Stock Used on This Bill</h2>
            <p className="mt-1 text-xs text-slate-500">Exact batches deducted for this visit.</p>
          </div>
          <button type="button" className="button-secondary px-3" onClick={loadUsage} aria-label="Reload stock usage"><MdReplay /></button>
        </div>
        {usageError && <p className="mt-3 text-xs font-semibold text-rose-700">{usageError}</p>}

        <h3 className="mt-4 text-xs font-bold text-slate-500">Used during the consultation</h3>
        {usage.consultation.length === 0 ? (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No consumables were recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {usage.consultation.map((row) => (
              <li key={row.usage_batch_id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{row.item_name}</p>
                    <p className="text-xs text-slate-500">{row.batch_code || `Batch #${row.batch_id}`} from {row.source_location || 'stock'}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-black text-slate-900">{formatQty(row.used_quantity)} {row.unit}</p>
                </div>
                {row.returned_quantity > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">{formatQty(row.returned_quantity)} returned to stock</p>}
                {row.returnable_quantity > 0 && (
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900" onClick={() => openReturn(row)}>
                    <MdKeyboardReturn /> Return unused quantity
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-4 text-xs font-bold text-slate-500">Dispensed at Checkout</h3>
        {usage.checkout.length === 0 ? (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Nothing dispensed yet. Checkout medicines are deducted when the bill is fully paid.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {usage.checkout.map((row) => (
              <li key={row.usage_id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{row.item_name}</p>
                  <p className="text-xs text-slate-500">{row.batch_code || `Batch #${row.batch_id}`} from {row.source_location || 'stock'}</p>
                  {row.returned && <p className="mt-1 text-xs font-semibold text-emerald-700">Returned to stock {formatDate(row.returned_at)}</p>}
                </div>
                <p className={`shrink-0 text-sm font-black ${row.returned ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatQty(row.quantity)} {row.unit}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(action)}
        onClose={() => !busy && setAction(null)}
        closeDisabled={busy}
        title={action === 'void' ? `Void Bill #${bill.id}` : `Reopen Bill #${bill.id}`}
        description={action === 'void' ? 'The bill stays in the records with status Voided and is excluded from billed totals.' : 'The bill returns to Draft so Checkout can correct it, confirm it and take payment again.'}
        size="md"
      >
        <div className="space-y-4">
          {action === 'reopen' && dispensedLines.length > 0 && (
            <p className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-800">
              {dispensedLines.length} dispensed Checkout line{dispensedLines.length === 1 ? '' : 's'} will go back to the original batch. They are deducted again when the corrected bill is fully paid.
            </p>
          )}
          {action === 'void' && dispensedLines.length > 0 && (
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} />
              <span>
                <span className="font-bold text-slate-800">Return dispensed Checkout medicines to stock</span>
                <span className="mt-0.5 block text-xs text-slate-500">Leave this ticked only if the patient handed the medicines back. Untick it for a waived bill where the patient keeps them.</span>
              </span>
            </label>
          )}
          <p className="text-xs text-slate-500">Consultation consumables are not returned automatically because they were used. Return any unused quantity from the stock panel.</p>
          <label className="block">
            <span className="form-label">Reason *</span>
            <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="form-control mt-1.5 resize-none" placeholder="Explain the correction for the audit record." />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</button>
            <button type="button" className={action === 'void' ? 'button-danger' : 'button-primary'} disabled={busy || reason.trim().length < 5} onClick={submitAction}>
              {busy ? 'Saving…' : action === 'void' ? 'Void Bill' : 'Reopen as Draft'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(returnTarget)}
        onClose={() => !busy && setReturnTarget(null)}
        closeDisabled={busy}
        title="Return Unused Consumable"
        description={returnTarget ? `${returnTarget.item_name}, ${returnTarget.batch_code || `Batch #${returnTarget.batch_id}`}` : ''}
        size="md"
      >
        {returnTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Goes back into the same batch at {returnTarget.source_location || 'its original location'}. Up to {formatQty(returnTarget.returnable_quantity)} {returnTarget.unit} can be returned. The bill amount does not change.
            </p>
            <label className="block">
              <span className="form-label">Quantity *</span>
              <input type="number" min="1" step="1" max={returnTarget.returnable_quantity} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} className="form-control mt-1.5" />
            </label>
            <label className="block">
              <span className="form-label">Reason *</span>
              <input type="text" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} className="form-control mt-1.5" placeholder="Example: syringe not opened" />
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setReturnTarget(null)}>Cancel</button>
              <button
                type="button"
                className="button-primary"
                disabled={busy || !(Number(returnQty) > 0) || Number(returnQty) > returnTarget.returnable_quantity || !Number.isInteger(Number(returnQty)) || reason.trim().length < 3}
                onClick={submitReturn}
              >
                {busy ? 'Returning…' : 'Return to Stock'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default BillCorrectionsPanel
