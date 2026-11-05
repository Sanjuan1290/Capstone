import { useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { getMyHistory, getMyBillingHistory, getMyBillingDetails } from '../../services/patient.service'
import { printBillingReceipt } from '../../utils/billingReceipt'
import { doctorClinicLabel } from '../../utils/doctor'
import { formatAppointmentRange, formatDurationMinutes, getReservedDurationMinutes } from '../../utils/appointmentTime'
import {
  MdAccessTime, MdCalendarToday, MdClose, MdExpandLess, MdExpandMore,
  MdFace, MdHistory, MdImage, MdLocalPharmacy, MdMedicalServices,
  MdNotes, MdOpenInNew, MdSearch, MdReceipt, MdPayments, MdRefresh,
  MdChevronRight, MdDownload, MdAccountBalanceWallet, MdCheckCircle,
} from 'react-icons/md'

const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)
const formatDate = raw => {
  if (!raw) return '—'
  const [year, month, day] = String(raw).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return String(raw)
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
const paymentStatus = bill => {
  const status = String(bill?.payment_status || bill?.billing_status || '').toLowerCase()
  const stored = status || String(bill?.status || '').toLowerCase()
  if (['voided', 'refunded', 'preparing', 'unpaid', 'partially_paid', 'paid'].includes(stored)) return stored
  if (stored === 'draft') return 'preparing'
  if (Number(bill?.billing_total ?? bill?.total_amount) <= 0) return 'paid'
  if (Number(bill?.billing_paid_amount ?? bill?.paid_amount) >= Number(bill?.billing_total ?? bill?.total_amount) - 0.005) return 'paid'
  if (Number(bill?.billing_paid_amount ?? bill?.paid_amount) > 0) return 'partially_paid'
  return 'unpaid'
}
const PAYMENT_LABEL = {
  paid: 'Paid', unpaid: 'Unpaid', partially_paid: 'Partially Paid',
  preparing: 'Preparing Bill', refunded: 'Refunded', voided: 'Voided',
}
const statusStyle = status => ({
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
  partially_paid: 'bg-amber-50 text-amber-800 border-amber-200',
  preparing: 'bg-slate-100 text-slate-600 border-slate-200',
  refunded: 'bg-violet-50 text-violet-700 border-violet-200',
  voided: 'bg-slate-100 text-slate-500 border-slate-200',
}[status] || 'bg-slate-100 text-slate-600 border-slate-200')
const PaymentBadge = ({ status }) => <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(status)}`}>{PAYMENT_LABEL[status] || 'Bill Available'}</span>
const VISIT_STATUS = {
  completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', color: 'bg-rose-50 text-rose-700' },
  rejected: { label: 'Rejected', color: 'bg-slate-100 text-slate-600' },
  no_show: { label: 'Did Not Arrive', color: 'bg-amber-50 text-amber-800' },
}
const parseRx = value => {
  try { const rows = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(rows) ? rows : [] } catch { return [] }
}
const groupByMonth = items => items.reduce((groups, item) => {
  const raw = String(item.appointment_date || item.date || '')
  const [y, m] = raw.slice(0, 7).split('-').map(Number)
  const name = y && m ? new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : 'Other'
  ;(groups[name] ||= []).push(item)
  return groups
}, {})

const ProgressImages = ({ images }) => {
  const list = Array.isArray(images) ? images.filter(image => image?.image_url) : []
  return <div className="grid gap-3 sm:grid-cols-2">
    {list.map((image, index) => <a key={`${image.image_url}-${index}`} href={image.image_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-emerald-200">
      <img src={image.image_url} alt={image.caption || `Progress image ${index + 1}`} className="h-36 w-full bg-slate-100 object-cover" />
      <span className="flex items-center justify-between gap-2 p-3 text-xs text-slate-600"><span className="space-y-1"><span className="block">{image.caption || `Progress image ${index + 1}`}</span>{image.security_scan_status === 'approved' && <span className="block text-[10px] font-bold text-emerald-700">Security scan passed</span>}</span><MdOpenInNew className="shrink-0" /></span>
    </a>)}
  </div>
}

const VisitCard = ({ visit, expanded, onToggle, onViewBill }) => {
  const Icon = visit.type === 'derma' ? MdFace : MdMedicalServices
  const rx = parseRx(visit.prescription)
  const images = Array.isArray(visit.progress_images) ? visit.progress_images.filter(image => image?.image_url) : []
  const status = VISIT_STATUS[visit.status] || { label: String(visit.status || 'History').replaceAll('_', ' '), color: 'bg-slate-100 text-slate-600' }
  const hasClinical = visit.status === 'completed' && Boolean(visit.diagnosis || visit.consultation_notes || rx.length || images.length)
  const billStatus = visit.billing_id ? paymentStatus({
    billing_status: visit.billing_status, billing_total: visit.billing_total, billing_paid_amount: visit.billing_paid_amount,
  }) : null
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visit.type === 'derma' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}><Icon className="text-xl" /></div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">{visit.requested_service_name_snapshot || visit.reason || 'Clinic Visit'}</h3><p className="mt-0.5 text-xs text-slate-500">{visit.doctor || visit.doctor_name} · {doctorClinicLabel(visit)}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.color}`}>{status.label}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1"><MdCalendarToday />{formatDate(visit.appointment_date || visit.date)}</span>
            <span className="flex items-center gap-1"><MdAccessTime />{formatAppointmentRange(visit)}</span>
            {visit.branch_name && <span>{visit.branch_name}</span>}
            {visit.requested_service_name_snapshot && <span>{formatDurationMinutes(getReservedDurationMinutes(visit))}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {billStatus ? <PaymentBadge status={billStatus} /> : <span className="text-xs text-slate-400">No bill recorded</span>}
            {visit.billing_id && <button type="button" onClick={() => onViewBill(visit.billing_id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50"><MdReceipt /> View Bill <MdChevronRight /></button>}
          </div>
        </div>
      </div>
      {visit.status === 'cancelled' && (visit.cancellation_reason_snapshot || visit.cancellation_details) && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">Cancellation: {visit.cancellation_reason_snapshot || 'Not specified'}{visit.cancellation_details ? ` — ${visit.cancellation_details}` : ''}</p>}
      {visit.status === 'rejected' && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Reason: {visit.rejection_reason || 'Appointment request was not confirmed.'}</p>}
    </div>
    {expanded && hasClinical && <section className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
      {visit.diagnosis && <div><h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Diagnosis</h4><p className="rounded-lg bg-white p-3 text-sm text-slate-700">{visit.diagnosis}</p></div>}
      {visit.consultation_notes && <div><h4 className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><MdNotes /> Clinical Notes</h4><p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-700">{visit.consultation_notes}</p></div>}
      {rx.length > 0 && <div><h4 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><MdLocalPharmacy /> Prescriptions</h4><div className="space-y-2">{rx.map((item, i) => <div key={i} className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="font-semibold text-violet-900">{item.medicine}</p><p className="mt-1 text-xs text-violet-700">{[item.quantity ?? item.dosage ? `Qty: ${item.quantity ?? item.dosage}` : '', item.frequency, item.duration].filter(Boolean).join(' · ')}</p>{item.notes && <p className="mt-1 text-xs italic text-violet-700">{item.notes}</p>}</div>)}</div></div>}
      {images.length > 0 && <div><h4 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500"><MdImage /> Progress Images</h4><ProgressImages images={images} /></div>}
    </section>}
    {hasClinical && <button type="button" onClick={() => onToggle(visit.id)} className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50">{expanded ? <><MdExpandLess /> Hide Consultation Details</> : <><MdExpandMore /> View Consultation Details</>}</button>}
  </article>
}

const BillCard = ({ bill, onViewDetails }) => {
  const status = paymentStatus(bill)
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="space-y-1"><h3 className="font-bold text-slate-900">{bill.service_name || `Clinic Bill #${bill.id}`}</h3><p className="text-xs text-slate-500">Bill #{bill.id} · {formatDate(bill.appointment_date)}</p><p className="text-xs text-slate-500">{bill.branch_name} · {bill.doctor_name}</p></div><PaymentBadge status={status} /></div>
    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Final Bill</p><p className="mt-1 text-sm font-bold text-slate-900">{money(bill.total_amount)}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Paid</p><p className="mt-1 text-sm font-bold text-emerald-700">{money(bill.paid_amount)}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Balance</p><p className="mt-1 text-sm font-bold text-slate-900">{money(bill.balance_amount)}</p></div>
    </div>
    <button type="button" onClick={() => onViewDetails(bill.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><MdReceipt /> View Bill & Payments <MdChevronRight /></button>
  </article>
}

const BillDetails = ({ billId, detail, loading, error, onClose, onViewVisit, onRetry }) => {
  const [receiptError, setReceiptError] = useState('')
  useEffect(() => {
    const onEscape = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])
  const printReceipt = payment => {
    setReceiptError('')
    const ok = printBillingReceipt({ bill: detail, payment, clinicSettings: detail.receipt_clinic,
      onPopupBlocked: () => setReceiptError('Allow pop-ups for this website to print your receipt.') })
    if (!ok) setReceiptError('The receipt could not open. Check your browser pop-up settings.')
  }
  return <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label="Patient bill details">
    <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-label="Close bill details" />
    <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4 sm:px-6"><div><h2 className="text-lg font-bold text-slate-900">Bill #{billId}</h2><p className="text-xs text-slate-500">Your charges, payments and receipts</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><MdClose className="text-xl" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-4 sm:p-6">
        {loading ? <p className="py-16 text-center text-sm text-slate-500">Loading bill details…</p> : error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 font-bold underline">Retry</button></div> : detail ? <>
          <section className="space-y-2"><div className="flex items-center justify-between"><PaymentBadge status={paymentStatus(detail)} /><span className="text-xs text-slate-500">{formatDate(detail.appointment_date)}</span></div><p className="text-sm font-semibold text-slate-800">{detail.branch_name}</p><p className="text-xs text-slate-500">{detail.doctor_name}</p><button type="button" onClick={() => onViewVisit(detail.appointment_id)} className="text-xs font-bold text-sky-700 hover:underline">View linked appointment</button></section>
          <section><h3 className="mb-3 text-sm font-bold text-slate-900">Itemized Charges</h3><div className="divide-y divide-slate-100 rounded-xl border border-slate-200">{(detail.items || []).map(item => <div key={item.id} className="p-3"><div className="flex justify-between gap-3 text-sm"><div><p className="font-medium text-slate-800">{item.service_name}</p><p className="mt-0.5 text-xs text-slate-500">{item.quantity} × {money(item.unit_price)}</p></div><p className="font-semibold text-slate-800">{money(item.line_total)}</p></div>{item.included_supplies?.length > 0 && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-400">Included in service charge — not charged again</p>{item.included_supplies.map((s, i) => <p key={i} className="mt-1 text-xs text-slate-600">{s.name} · {s.quantity} {s.unit}</p>)}</div>}</div>)}{!detail.items?.length && <p className="p-3 text-xs text-slate-500">No charge lines recorded.</p>}</div></section>
          <section className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{money(detail.subtotal)}</span></div>{Number(detail.promotion_discount_amount || 0) > 0 && <div className="flex justify-between gap-3 text-emerald-700"><span>{detail.selected_promotion?.title_at_booking || 'Service promotion'}</span><span>−{money(detail.promotion_discount_amount)}</span></div>}{Number(detail.discount_amount || 0) > Number(detail.promotion_discount_amount || 0) && <div className="flex justify-between gap-3 text-emerald-700"><span>Other approved discount</span><span>−{money(Math.max(0,Number(detail.discount_amount || 0)-Number(detail.promotion_discount_amount || 0)))}</span></div>}<div className="flex justify-between border-t border-slate-200 pt-3 font-bold"><span>Final Bill</span><span>{money(detail.total_amount)}</span></div><div className="flex justify-between"><span>Net Payments</span><span>{money(detail.paid_amount)}</span></div><div className="flex justify-between font-bold"><span>Remaining Balance</span><span>{money(detail.balance_amount)}</span></div></section>
          <section><h3 className="mb-3 text-sm font-bold text-slate-900">Payment History</h3><div className="space-y-3">{detail.payments?.length ? detail.payments.map(payment => { const refunded = Number(payment.refund_amount || 0); const isVoid = payment.status === 'voided' || Boolean(payment.voided_at); return <div key={payment.id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{money(payment.amount)}</p><p className="text-xs text-slate-500">{formatDate(payment.paid_at)} · {String(payment.payment_method || '').replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">Receipt: {payment.receipt_number || '—'}</p></div><span className="text-xs font-bold text-slate-500">{isVoid ? 'Voided' : refunded >= Number(payment.amount) && refunded > 0 ? 'Refunded' : refunded > 0 ? 'Partially Refunded' : 'Recorded'}</span></div>{refunded > 0 && <p className="mt-2 text-xs text-violet-700">Refunded: {money(refunded)} · Net payment: {money(Math.max(0, Number(payment.amount) - refunded))}</p>}{payment.receipt_number && <button type="button" onClick={() => printReceipt(payment)} className="mt-3 flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><MdDownload /> View / Print Receipt</button>}</div> }) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No payments recorded for this bill.</p>}</div>{receiptError && <p role="alert" className="mt-2 text-xs text-rose-700">{receiptError}</p>}</section>
        </> : null}
      </div>
    </div>
  </div>
}

const History = () => {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('visits')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyRequest, setHistoryRequest] = useState(0)
  const [visitSearch, setVisitSearch] = useState('')
  const [visitStatus, setVisitStatus] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [expandedVisitId, setExpandedVisitId] = useState(null)
  const [requestedVisitJump, setRequestedVisitJump] = useState(null)
  const [billSearch, setBillSearch] = useState('')
  const [debouncedBillSearch, setDebouncedBillSearch] = useState('')
  const [billStatus, setBillStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [billPage, setBillPage] = useState(1)
  const [billPageSize, setBillPageSize] = useState(10)
  const [billResults, setBillResults] = useState({ bills: [], total: 0, page: 1, totalPages: 1, summary: null })
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingError, setBillingError] = useState('')
  const [billingRequest, setBillingRequest] = useState(0)
  const [selectedBillId, setSelectedBillId] = useState(null)
  const [billDetail, setBillDetail] = useState(null)
  const [billDetailLoading, setBillDetailLoading] = useState(false)
  const [billDetailError, setBillDetailError] = useState('')
  const [detailRequest, setDetailRequest] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const billId = Number(params.get('bill_id')), appointmentId = Number(params.get('appointment_id'))
    if (billId > 0) { setActiveTab('bills'); setBillDetail(null); setSelectedBillId(billId) }
    if (appointmentId > 0) { setActiveTab('visits'); setExpandedVisitId(appointmentId); setRequestedVisitJump(appointmentId) }
  }, [location.search, location.key])
  useEffect(() => {
    let current = true
    setHistoryLoading(true)
    setHistoryError('')
    getMyHistory().then(data => { if (current) setHistory(Array.isArray(data) ? data : []) })
      .catch(error => { if (current) setHistoryError(error.message || 'Visit history could not be loaded.') })
      .finally(() => { if (current) setHistoryLoading(false) })
    return () => { current = false }
  }, [historyRequest])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedBillSearch(billSearch), 300); return () => window.clearTimeout(timer) }, [billSearch])
  useEffect(() => {
    let current = true
    setBillingLoading(true)
    setBillingError('')
    getMyBillingHistory({ page: billPage, limit: billPageSize, branch_id: branchFilter, status: billStatus, search: debouncedBillSearch, date_from: dateFrom, date_to: dateTo })
      .then(data => { if (current) setBillResults(data) })
      .catch(error => { if (current) setBillingError(error.message || 'Billing history could not be loaded.') })
      .finally(() => { if (current) setBillingLoading(false) })
    return () => { current = false }
  }, [billPage, billPageSize, branchFilter, billStatus, debouncedBillSearch, dateFrom, dateTo, billingRequest])
  useEffect(() => {
    if (!selectedBillId) return undefined
    let current = true
    setBillDetail(null); setBillDetailLoading(true); setBillDetailError('')
    getMyBillingDetails(selectedBillId).then(data => { if (current) setBillDetail(data) })
      .catch(error => { if (current) setBillDetailError(error.message || 'Bill details could not be loaded.') })
      .finally(() => { if (current) setBillDetailLoading(false) })
    return () => { current = false }
  }, [selectedBillId, detailRequest])

  const branches = useMemo(() => Array.from(new Map(history.filter(v => v.branch_id && v.branch_name).map(v => [String(v.branch_id), v.branch_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [history])
  const filteredVisits = useMemo(() => history.filter(visit => {
    const term = visitSearch.trim().toLowerCase()
    return (branchFilter === 'all' || String(visit.branch_id) === branchFilter)
      && (visitStatus === 'all' || visit.status === visitStatus)
      && (!dateFrom || String(visit.appointment_date || visit.date || '').slice(0, 10) >= dateFrom)
      && (!dateTo || String(visit.appointment_date || visit.date || '').slice(0, 10) <= dateTo)
      && (!term || [visit.doctor, visit.doctor_name, visit.reason, visit.diagnosis, visit.requested_service_name_snapshot, visit.branch_name].some(value => String(value || '').toLowerCase().includes(term)))
  }), [history, visitSearch, visitStatus, branchFilter, dateFrom, dateTo])
  const visitsPager = useClientPagination(filteredVisits, { initialPageSize: 5, resetDeps: [branchFilter, visitSearch, visitStatus, dateFrom, dateTo] })
  const groupedVisits = groupByMonth(visitsPager.pageItems)
  useEffect(() => {
    if (requestedVisitJump === null) return
    const index = filteredVisits.findIndex(v => Number(v.id) === requestedVisitJump)
    visitsPager.setPage(index < 0 ? 1 : Math.floor(index / visitsPager.pageSize) + 1)
    setRequestedVisitJump(null)
  }, [requestedVisitJump, filteredVisits, visitsPager.pageSize]) // eslint-disable-line react-hooks/exhaustive-deps
  const completedCount = history.filter(v => v.status === 'completed').length
  const changeBranch = value => { setBranchFilter(value); setBillPage(1) }
  const changeBillStatus = value => { setBillStatus(value); setBillPage(1) }
  const openBill = id => { setBillDetail(null); setSelectedBillId(id) }
  const openVisitFromBill = appointmentId => {
    setSelectedBillId(null)
    setActiveTab('visits')
    setVisitStatus('all'); setVisitSearch(''); setBranchFilter('all'); setBillPage(1)
    setExpandedVisitId(Number(appointmentId))
    setRequestedVisitJump(Number(appointmentId))
  }
  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 lg:text-2xl"><MdHistory className="text-slate-500" /> Visit & Billing History</h1><p className="mt-1 text-sm text-slate-500">Review your previous clinic visits, charges, payments and receipts.</p></div><button type="button" onClick={() => { setHistoryRequest(n => n + 1); setBillingRequest(n => n + 1) }} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><MdRefresh /> Refresh</button></header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><MdHistory className="text-slate-500"/><p className="mt-2 text-2xl font-bold text-slate-900">{historyLoading ? '—' : history.length}</p><p className="text-xs text-slate-500">Total Visits</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><MdCheckCircle className="text-emerald-600"/><p className="mt-2 text-2xl font-bold text-slate-900">{historyLoading ? '—' : completedCount}</p><p className="text-xs text-slate-500">Completed Visits</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><MdReceipt className="text-emerald-600"/><p className="mt-2 text-2xl font-bold text-slate-900">{billResults.summary && !billingError ? billResults.summary.paid_bills : '—'}</p><p className="text-xs text-slate-500">Paid Bills</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><MdAccountBalanceWallet className="text-amber-600"/><p className="mt-2 text-xl font-bold text-slate-900">{billResults.summary && !billingError ? money(billResults.summary.outstanding_balance) : '—'}</p><p className="text-xs text-slate-500">Outstanding Balance</p></div>
    </div>
    <div role="tablist" aria-label="History sections" className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5">
      {[{ key: 'visits', label: 'Visit History', icon: MdMedicalServices }, { key: 'billing', label: 'Billing History', icon: MdPayments }].map(item => { const Icon = item.icon; return <button key={item.key} type="button" role="tab" aria-selected={activeTab === item.key} onClick={() => setActiveTab(item.key)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${activeTab === item.key ? 'bg-[#0d2035] text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Icon />{item.label}</button> })}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_170px]">
        <label className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={activeTab === 'visits' ? visitSearch : billSearch} onChange={event => { if (activeTab === 'visits') setVisitSearch(event.target.value); else { setBillSearch(event.target.value); setBillPage(1) } }} placeholder={activeTab === 'visits' ? 'Search doctor, service or diagnosis…' : 'Search service, doctor, receipt or bill…'} className="form-control w-full pl-10" aria-label="Search history" /></label>
        <label className="space-y-1"><span className="block text-xs font-semibold text-slate-500">Clinic Branch</span><select className="form-control w-full" value={branchFilter} onChange={event => changeBranch(event.target.value)}><option value="all">All Branches</option>{branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="space-y-1"><span className="block text-xs font-semibold text-slate-500">{activeTab === 'visits' ? 'Visit Status' : 'Payment Status'}</span>{activeTab === 'visits' ? <select className="form-control w-full" value={visitStatus} onChange={event => setVisitStatus(event.target.value)}><option value="all">All Visit Statuses</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option><option value="no_show">Did Not Arrive</option></select> : <select className="form-control w-full" value={billStatus} onChange={event => changeBillStatus(event.target.value)}><option value="all">All Payment Statuses</option>{Object.entries(PAYMENT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="block text-xs font-semibold text-slate-500">From</span><input type="date" className="form-control w-full" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setBillPage(1) }} /></label><label className="space-y-1"><span className="block text-xs font-semibold text-slate-500">To</span><input type="date" className="form-control w-full" value={dateTo} min={dateFrom || undefined} onChange={event => { setDateTo(event.target.value); setBillPage(1) }} /></label></div>
    </div>
    {activeTab === 'visits' ? <section aria-label="Visit history" className="space-y-5">
      {historyLoading ? <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500">Loading visits…</div> : historyError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{historyError}<button className="ml-2 font-bold underline" onClick={() => setHistoryRequest(n => n + 1)}>Retry</button></div> : !history.length ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">No previous appointments yet.</div> : !filteredVisits.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No visits matched your filters.</div> : <>{Object.entries(groupedVisits).map(([month, visits]) => <div key={month} className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{month}</h2>{visits.map(visit => <VisitCard key={visit.id} visit={visit} expanded={Number(expandedVisitId) === Number(visit.id)} onToggle={id => setExpandedVisitId(current => current === id ? null : id)} onViewBill={openBill} />)}</div>)}<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><Pagination {...visitsPager} pageSizeOptions={[5, 10, 20]} /></div></>}
    </section> : <section aria-label="Billing history" className="space-y-4">
      {billingLoading ? <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500">Loading bills…</div> : billingError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{billingError}<button onClick={() => setBillingRequest(n => n + 1)} className="ml-2 font-bold underline">Retry</button></div> : billResults.total === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">No bills matched your filters.</div> : <>{billResults.bills.map(bill => <BillCard key={bill.id} bill={bill} onViewDetails={openBill} />)}<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><Pagination page={billPage} pageSize={billPageSize} total={billResults.total} totalPages={billResults.totalPages} onPageChange={setBillPage} onPageSizeChange={size => { setBillPageSize(size); setBillPage(1) }} pageSizeOptions={[10, 20, 50]} /></div></>}
    </section>}
    {selectedBillId && <BillDetails key={selectedBillId} billId={selectedBillId} detail={billDetail} loading={billDetailLoading} error={billDetailError} onClose={() => setSelectedBillId(null)} onRetry={() => setDetailRequest(n => n + 1)} onViewVisit={openVisitFromBill} />}
  </div>
}
export default History

