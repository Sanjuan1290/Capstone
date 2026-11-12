import {formatMoney} from '../../utils/billingUi'

// Billing-only service charge. This never edits the doctor's record or uses inventory.
export default function CheckoutServiceEditor({item,services=[],promotions=[],loadError="",loading=false,onRetry,onSelect,onPromotion,onNotes}){
 const chosen=services.find(service=>Number(service.id)===Number(item.catalog_service_id))
 const offers=promotions.filter(p=>Number(p.service_id)===Number(item.catalog_service_id))
 return <div className="mt-4 space-y-3">
  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
   This adds a service charge to the bill only. It does not change the doctor's consultation record or deduct included inventory items. Confirm the service was performed and enter a reason.
  </div>
  {loadError ? (
  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
   <span>Could not load available clinic services: {loadError}</span>
   {onRetry && <button type="button" className="button-secondary" onClick={onRetry}>Retry</button>}
  </div>
 ) : !loading && services.length===0 ? (
  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
   No active services are available for this appointment's clinic at the selected branch.
  </p>
 ) : null}
 <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
   <label><span className="form-label">Clinic Service *</span>
    <select className="form-control mt-1" value={item.catalog_service_id||''} onChange={e=>onSelect(e.target.value)} disabled={loading || Boolean(loadError) || services.length===0}>
     <option value="">{loading ? "Loading services..." : "Select a service"}</option>
     {services.map(service=><option key={service.id} value={service.id}>{service.service_name}</option>)}
    </select>
   </label>
   <div><span className="form-label">Service Price</span><div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold text-slate-800">{chosen?formatMoney(chosen.default_price):'—'}</div></div>
  </div>
  <label className="block"><span className="form-label">Promotion for this Service</span>
   <select className="form-control mt-1" value={item.promotion_id==null?'':String(item.promotion_id)} onChange={e=>onPromotion(e.target.value)} disabled={!chosen}>
    <option value="">Use the booked offer if eligible</option>
    <option value="0">No promotion</option>
    {offers.map(p=><option key={p.id} value={p.id}>{p.title} — {p.discount_type==='percentage'?`${p.discount_value}% off`:`${formatMoney(p.discount_value)} off`}</option>)}
   </select>
   <span className="mt-1 block text-xs text-slate-500">The saved bill checks service eligibility and the appointment date before applying the promotion.</span>
  </label>
  <label className="block"><span className="form-label">Reason for adding this service *</span>
   <textarea className="form-control mt-1" rows={2} maxLength={500} value={item.notes||''} onChange={e=>onNotes(e.target.value)} placeholder="Example: Service was performed but was not listed during consultation" />
  </label>
 </div>
}

