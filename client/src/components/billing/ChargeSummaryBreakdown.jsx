import { chargeSummaryLines } from '../../utils/chargeSummary.mjs'
import { formatMoney } from '../../utils/billingUi'

export default function ChargeSummaryBreakdown({ items, totals }) {
  return <div className="mt-4 space-y-4 text-sm" aria-label="Charge breakdown">
    <ul className="divide-y divide-slate-100">
      {chargeSummaryLines(items).map((line, index) => <li key={index} className="py-3 first:pt-0">
        <p className="text-xs font-semibold text-slate-500">{line.type}</p>
        <div className="mt-1 flex justify-between gap-3"><span className="min-w-0 break-words font-semibold">{line.name}</span><strong className="shrink-0">{formatMoney(line.total)}</strong></div>
        <p className="mt-1 text-xs text-slate-500">{line.quantity} × {formatMoney(line.unitPrice)}</p>
        {line.servicePortion != null && <p className="mt-1 text-xs text-slate-600">Service portion: {formatMoney(line.servicePortion)}</p>}
        {line.includedItems.length > 0 && <div className="mt-2 border-l-2 border-slate-200 pl-3">
          <p className="text-xs font-semibold text-slate-600">Items used (included in service unless billed separately)</p>
          <ul className="mt-1 space-y-2">{line.includedItems.map((material, i) => <li key={i} className="text-xs text-slate-600">
            <div className="flex justify-between gap-2"><span className="min-w-0 break-words">{material.name} · {material.quantity} {material.unit}</span>{material.total != null && <span className="shrink-0">{formatMoney(material.total)}</span>}</div>
            <p>{material.included ? 'Included' : 'Billed separately below'}</p>
          </li>)}</ul>
        </div>}
      </li>)}
    </ul>
    {!items?.length && <p className="text-slate-500">No charges added.</p>}
    <div className="flex justify-between border-t border-slate-100 pt-3"><span>Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div>
    <div className="flex justify-between"><span>Discounts & charge reductions</span><strong>− {formatMoney(totals.discount)}</strong></div>
    <div className="flex justify-between gap-2 border-t border-slate-200 pt-3 text-lg"><span className="font-black">Current Total</span><strong>{formatMoney(totals.total)}</strong></div>
  </div>
}
