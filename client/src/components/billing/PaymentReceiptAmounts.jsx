import { paymentReceiptAmounts } from '../../utils/paymentReceiptAmounts.mjs'
import { formatMoney } from '../../utils/billingUi'

export default function PaymentReceiptAmounts({ payment }) {
  return <dl aria-label="Payment amounts" className="min-w-48 space-y-1 text-sm">
    {paymentReceiptAmounts(payment).map(({ label, amount }) => <div key={label} className="flex justify-between gap-5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{amount === null ? 'Not recorded' : formatMoney(amount)}</dd>
    </div>)}
  </dl>
}
