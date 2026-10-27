import { calculatePaymentPreview } from '../../utils/paymentPreview.mjs'

// Informational only: all confirmed totals continue to come from the server bill.
export default function PaymentPreview({ bill, draft, formatMoney }) {
  if (!draft?.payment_method) return null
  const preview = calculatePaymentPreview({ bill, draft })
  return (
    <section aria-label="Estimated payment preview" aria-live="polite" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
      <p className="font-bold text-slate-800 dark:text-slate-100">Estimate only — not yet recorded</p>
      {!preview.valid ? (
        <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300" role="status">{preview.message}</p>
      ) : (
        <dl className="mt-2 space-y-2 text-slate-700 dark:text-slate-200">
          <div className="flex justify-between gap-2"><dt>Payment being entered</dt><dd className="font-bold">{formatMoney(preview.amount)}</dd></div>
          {preview.isCash && <>
            <div className="flex justify-between gap-2"><dt>Cash received</dt><dd className="font-bold">{formatMoney(preview.cashReceived)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Expected change</dt><dd className="font-bold">{formatMoney(preview.change)}</dd></div>
          </>}
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-600"><dt>Estimated balance after recording</dt><dd className="font-bold">{formatMoney(preview.balanceAfter)}</dd></div>
        </dl>
      )}
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Recorded Paid and Balance above update only after a successful payment.</p>
    </section>
  )
}

