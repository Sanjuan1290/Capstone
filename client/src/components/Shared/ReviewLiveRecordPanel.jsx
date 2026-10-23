import { FiAlertTriangle, FiArrowLeft, FiEye, FiLock, FiX } from 'react-icons/fi'
import { REVIEW_FORM_TEMPLATES } from '../../utils/reviewFormTemplates'
import { formatSnapshotValue, humanizeKey, isPlainObject } from '../../utils/reviewSnapshotFormat'

// Both current-record and historical comparison views use the same presentation
// schema. This component never mounts the editable form or its mutation handlers.
const ALIASES = Object.freeze({
  name:['seller_group_name','networkName','projectName'],
  fullName:['full_name','display_name','buyer_full_name'],
  role:['position'],
  status:['user_status','accredited_seller_status','seller_group_status','listing_status','account_status','payment_status'],
  accreditationDate:['accredited_seller_accreditation_date'],
  groupName:['seller_group_name'], networkName:['seller_group_name'],
  groupType:['seller_group_type','type'],
  groupId:['seller_group_id'], sellerGroupId:['seller_group_id'],
  reportsUnderName:['reports_under_name'], reportsUnderUserId:['reports_under_user_id','accredited_seller_reports_under_user_id'],
  headUserId:['seller_group_head_user_id'],
  assignedAccreditedSellerId:['assigned_accredited_seller_id'],
  assignedSellerId:['assigned_accredited_seller_id'],
  sellerName:['seller_name','seller'],
  buyerName:['buyerName','buyer_name','buyer_full_name','fullName'],
  buyerType:['buyer_type'],
  accountId:['lot_project_account_id','accountId','id'],
  account_reference:['accountReference'], account_status:['status'],
  reservation_date:['reservationDate'],
  buyer_name_snapshot:['buyerName'],
  listingId:['lot_project_listing_id','listingId','id'],
  unitCode:['unit_id','lot_project_listing_unit_id'],
  lotAreaSqm:['areaSqm','lot_project_listing_area_sqm'],
  netSellingPrice:['lot_project_listing_net_selling_price'],
  reservationFee:['lot_project_listing_reservation_fee'],
  paymentId:['lot_project_payment_id','paymentId','id'],
  paymentType:['lot_project_payment_type'],
  paymentMethod:['method','lot_project_payment_method'],
  paymentDate:['lot_project_payment_date'],
  amount:['lot_project_payment_amount','paymentAmount'],
  referenceId:['lot_project_payment_reference_id'],
  paymentStatus:['status','lot_project_payment_status'],
  scheduleId:['lot_project_payment_schedule_id','scheduleId','id'],
  schedule_status:['status'],
  description:['scheduleDescription'],
  due_date:['dueDate'],due_amount:['dueAmount'],penalty_amount:['penaltyAmount'],
  refund_amount:['refundAmount'],cancellation_reason:['cancellationReason'],
  broker:['broker_name'],
})
const blocked = (key) => /password|passcode|token|secret|otp|authorization|cookie|private.key|verification.code|_normalized/i.test(key)
const snake = key => String(key).replace(/[A-Z]/g, letter=>`_${letter.toLowerCase()}`)
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key)
const valueFor = (record,key) => {
  const options=[key,snake(key),...(ALIASES[key]||[])]
  const selected=options.find(candidate=>!blocked(candidate) && has(record,candidate))
  return selected ? {present:true,key:selected,value:record[selected]} : {present:false}
}
const display = (key,value) => value === null || value === '' ? 'Not Set' : formatSnapshotValue(key,value,{
  labelFor:humanizeKey,isHidden:blocked,
})
const CurrentField = ({label,keyName,value}) => {
  const shown = display(keyName,value)
  return <div className="min-w-0"><dt className="mb-1 text-xs font-semibold text-slate-600">{label}</dt>
    <dd className="min-h-10 break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
      {isPlainObject(value) || Array.isArray(value) ? <span className="whitespace-pre-wrap">{shown}</span> : shown}
    </dd>
  </div>
}

export default function ReviewLiveRecordPanel({ entityType, record, reviewId, onDismiss, onBackToReview, error = '', loading = false }) {
  const schema = REVIEW_FORM_TEMPLATES[entityType] || {title:'Record Details',sections:[]}
  const isFound = record && typeof record === 'object' && !Array.isArray(record)
  const sections = isFound ? schema.sections.map(([title,fields])=>({
    title,fields:fields.filter(key=>!blocked(key)).map(key=>({key,label:humanizeKey(key),...valueFor(record,key)})).filter(field=>field.present),
  })).filter(section=>section.fields.length) : []
  // No data should be synthesized from a historical snapshot here. A current
  // endpoint returning no recognized values is reported, not silently filled.
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={schema.title}>
    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center gap-3 border-b p-4">
        <FiEye className="text-xl text-blue-600"/>
        <div className="flex-1"><h2 className="text-base font-black text-slate-900">{schema.title}</h2><p className="flex items-center gap-1 text-xs font-semibold text-slate-500"><FiLock/> Current Saved Form · View Only</p></div>
        <button type="button" onClick={onDismiss} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Close record details"><FiX/></button>
      </header>
      <div className="overflow-y-auto p-4">
        {loading ? <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Loading exact record...</p> : error || !isFound ? <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"><FiAlertTriangle className="shrink-0"/>{error || 'The exact record could not be loaded. Its saved review is still available.'}</div> :
          sections.length ? <div className="space-y-5">{sections.map(section=><section key={section.title}><h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{section.title}</h3><dl className="grid gap-3 sm:grid-cols-2">{section.fields.map(field=><CurrentField key={field.key} keyName={field.key} label={field.label} value={field.value}/>)}</dl></section>)}<p className="text-xs font-semibold text-slate-500">Only values available from the authorized current record are shown. Historical values belong to Before &amp; After in Review Center.</p></div> : <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This record's current form fields were not included in the authorized response. No values have been inferred. Review its saved Before &amp; After history instead.</p>}
      </div>
      <footer className="flex justify-end border-t bg-slate-50 p-4"><button type="button" onClick={onBackToReview} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><FiArrowLeft/> Back to Review</button></footer>
    </div>
  </div>
}
