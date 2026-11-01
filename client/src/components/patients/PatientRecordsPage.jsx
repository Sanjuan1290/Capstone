import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MdArrowBack, MdCalendarToday, MdChevronLeft, MdChevronRight,
  MdHistory, MdInfoOutline, MdPayments, MdPerson,
  MdPrint, MdRefresh, MdSearch,
} from 'react-icons/md'
import { getClinicSettings } from '../../services/clinic.service'
import { printBillingReceipt } from '../../utils/billingReceipt'

const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)
const formatDate = value => {
  if (!value) return 'Not recorded'
  const date = new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const age = dob => {
  if (!dob) return null
  const birth = new Date(`${String(dob).slice(0,10)}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1
  return years >= 0 ? years : null
}
const statusLabel = value => ({
  completed: 'Completed', confirmed: 'Confirmed', pending: 'Waiting for confirmation',
  rescheduled: 'Rescheduled', cancelled: 'Cancelled', rejected: 'Declined',
  no_show: 'Did not attend', 'in-progress': 'In progress', in_progress: 'In progress',
  draft: 'Not finalized', ready: 'Ready for payment', partially_paid: 'Partially paid',
  paid: 'Paid', voided: 'Voided', refunded: 'Refunded',
}[value] || (value ? String(value).replace(/_/g, ' ') : 'Not recorded'))
const statusTone = value => ['completed', 'paid', 'confirmed'].includes(value) ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
  : ['cancelled', 'rejected', 'no_show', 'voided'].includes(value) ? 'bg-rose-50 border-rose-200 text-rose-700'
    : 'bg-amber-50 border-amber-200 text-amber-800'

function Status({ value }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(value)}`}>{statusLabel(value)}</span>
}
function Avatar({ name }) {
  return <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-base font-bold text-sky-300">
    {String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || <MdPerson />}
  </div>
}
function Empty({ title, explanation }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
    <MdInfoOutline className="mx-auto mb-2 text-3xl text-slate-400" aria-hidden="true" />
    <h3 className="text-base font-bold text-slate-800">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">{explanation}</p>
  </div>
}
function Info({ label, value }) {
  return <div className="min-w-0"><dt className="text-sm font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-base font-semibold text-slate-900">{value || 'Not recorded'}</dd></div>
}
const visitTitle = (visit, bill) => {
  const services = (visit.recorded_services || (bill?.items || []).filter(i => i.item_type === 'service')).filter(i => i.service_name)
  if (services.length) return services.map(i => i.service_name).join(', ')
  return visit.reason || visit.requested_service_name_snapshot || (visit.type === 'derma' ? 'Dermatology appointment' : 'Clinic appointment')
}
function VisitDetails({ visit, bill, canViewBilling, clinicSettings, onBack }) {
  const serviceItems = canViewBilling ? (bill?.items || []).filter(item => item.item_type === 'service') : (visit.recorded_services || [])
  const otherItems = (bill?.items || []).filter(item => item.item_type !== 'service')
  const print = payment => printBillingReceipt({
    bill, payment, clinicSettings,
    onPopupBlocked: () => window.alert('Your browser blocked the receipt window. Allow pop-ups for this clinic website and try again.'),
  })
  return <section aria-label="Visit details" className="space-y-5">
    <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
      <MdArrowBack aria-hidden="true" /> Back to Visit History
    </button>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-900">Visit Details</h2><p className="mt-1 text-sm text-slate-600">{formatDate(visit.date)}</p></div>
        <Status value={visit.status} />
      </div>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        <Info label="Date" value={formatDate(visit.date)} />
        <Info label="Time" value={visit.time} />
        <Info label="Attending doctor" value={visit.doctor_name} />
        <Info label="Clinic service category" value={visit.type === 'derma' ? 'Dermatology' : 'Medical'} />
        <Info label="Reason for appointment" value={visit.reason} />
        <Info label="Service requested when booked" value={visit.requested_service_name_snapshot} />
      </dl>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Services Recorded for This Visit</h3>
      <p className="mt-1 text-sm text-slate-500">These are recorded service entries, not simply the services requested during booking.</p>
      {serviceItems.length ? <div className="mt-4 divide-y divide-slate-100">{serviceItems.map(item =>
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-base">
          <span className="font-semibold text-slate-800">{item.service_name} <span className="font-normal text-slate-500">× {Number(item.quantity)}</span></span>
          {canViewBilling && <span className="font-semibold text-slate-900">{money(item.line_total)}</span>}
        </div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No completed service charge has been recorded for this visit.</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Doctor's Consultation Notes</h3>
      {visit.consultation_id ? <dl className="mt-4 grid gap-4">
        <Info label="Consultation record status" value={statusLabel(visit.consultation_status)} />
        <Info label="Doctor's findings" value={visit.diagnosis} />
        <Info label="Treatment notes" value={visit.consultation_notes} />
        <Info label="Prescription" value={visit.prescription_status === 'not_recorded' ? 'Not recorded' : visit.prescription} />
      </dl> : <p className="mt-3 text-sm text-slate-600">No doctor's consultation record has been saved for this appointment.</p>}
    </div>
    {canViewBilling ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Bill and Payment Details</h3>
      {!bill ? <p className="mt-3 text-sm text-slate-600">No bill has been created for this visit.</p> : <>
        <div className="mt-3"><Status value={bill.status} /></div>
        {otherItems.length > 0 && <div className="mt-4"><h4 className="font-semibold text-slate-800">Other charges</h4>{otherItems.map(item => <div key={item.id} className="flex justify-between gap-3 py-2 text-sm text-slate-700"><span>{item.service_name} × {Number(item.quantity)}</span><span>{money(item.line_total)}</span></div>)}</div>}
        <dl className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          <Info label="Bill total" value={money(bill.total_amount)} />
          <Info label="Discount" value={money(bill.discount_amount)} />
          <Info label="Paid to date" value={money(bill.paid_amount)} />
          <Info label="Remaining balance" value={money(bill.balance_amount)} />
        </dl>
        <h4 className="mt-6 font-semibold text-slate-900">Payment Receipts</h4>
        {!bill.payments?.length ? <p className="mt-2 text-sm text-slate-600">No payment or receipt has been recorded for this bill.</p> : <div className="mt-3 space-y-3">{bill.payments.map(payment => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div><p className="font-semibold text-slate-900">{payment.receipt_number ? `Receipt ${payment.receipt_number}` : 'Payment record'}</p>
            <p className="mt-1 text-sm text-slate-600">{formatDate(payment.paid_at)} · {payment.payment_method || 'Payment method not recorded'}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{money(payment.amount)} <span className="font-normal text-slate-500">· {statusLabel(payment.status)}</span></p>
            {Number(payment.refund_amount) > 0 && <p className="text-sm text-purple-700">Refunded: {money(payment.refund_amount)}</p>}
          </div>
          {payment.receipt_number ? <button type="button" onClick={() => print(payment)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 font-semibold text-sky-800 hover:bg-sky-100"><MdPrint aria-hidden="true" /> Print Receipt</button> : <span className="text-sm text-slate-500">Receipt not yet issued</span>}
        </div>)}</div>}
      </>}
    </div> : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Payment information is available only to staff with billing or checkout access.</p>}
  </section>
}

export default function PatientRecordsPage({ getDirectory, getPatientRecord }) {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [directory, setDirectory] = useState({ patients: [], total: 0, totalPages: 1 })
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')
  const [selected, setSelected] = useState(null)
  const [record, setRecord] = useState(null)
  const [recordError, setRecordError] = useState('')
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [tab, setTab] = useState('history')
  const [openVisit, setOpenVisit] = useState(null)
  const [reload, setReload] = useState(0)
  const [clinicSettings, setClinicSettings] = useState({})
  const requestSequence = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    let active = true
    getClinicSettings().then(data => { if (active) setClinicSettings(data || {}) }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    setLoadingList(true); setListError('')
    getDirectory({ search: term, page, limit: 10 })
      .then(data => { if (active) setDirectory(data) })
      .catch(err => { if (active) setListError(err?.message || 'Patient list could not be loaded.') })
      .finally(() => { if (active) setLoadingList(false) })
    return () => { active = false }
  }, [getDirectory, term, page, reload])

  const openPatient = async patient => {
    const seq = ++requestSequence.current
    setSelected(patient); setLoadingRecord(true); setRecord(null); setRecordError(''); setOpenVisit(null); setTab('history')
    try { const data = await getPatientRecord(patient.id); if (seq === requestSequence.current) setRecord(data) }
    catch (err) { if (seq === requestSequence.current) setRecordError(err?.message || 'Patient record could not be loaded.') }
    finally { if (seq === requestSequence.current) setLoadingRecord(false) }
  }
  const backToList = () => { ++requestSequence.current; setSelected(null); setRecord(null); setRecordError(''); setOpenVisit(null) }
  const patient = record?.patient
  const visits = useMemo(() => Array.isArray(record?.history) ? record.history : [], [record])
  const bills = useMemo(() => Array.isArray(record?.billing) ? record.billing : [], [record])
  const byAppointment = useMemo(() => new Map(bills.map(bill => [Number(bill.appointment_id), bill])), [bills])
  const completed = visits.filter(v => v.status === 'completed')
  const upcoming = visits.filter(v => ['pending','confirmed','rescheduled','in-progress','in_progress'].includes(v.status) && String(v.date) >= today())
  const previous = visits.filter(v => v.status !== 'completed' && !upcoming.includes(v))
  const mostRecent = completed[0]
  const canViewBilling = record?.can_view_billing !== false
  const balance = bills.filter(b => !['voided','refunded'].includes(b.status)).reduce((sum,b) => sum + Number(b.balance_amount || 0), 0)
  // A bill may predate the most recent 500 appointments. Keep its receipt reachable.
  const olderBill = bills.find(b => Number(b.appointment_id) === Number(openVisit))
  const selectedVisit = visits.find(v => Number(v.id) === Number(openVisit)) || (openVisit && olderBill ? {
    id: olderBill.appointment_id, date: olderBill.appointment_date, doctor_name: olderBill.doctor_name,
    reason: olderBill.appointment_reason, status: 'unknown', recorded_services: [],
  } : null)

  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-12 text-slate-900">
    {!selected ? <>
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Patient Records</h1>
        <p className="mt-2 text-base text-slate-600">Search for a patient to see their previous visits, treatments and receipts.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label htmlFor="patient-record-search" className="block text-base font-bold text-slate-800">Find a Patient</label>
        <p className="mt-1 text-sm text-slate-600">Enter a name, phone number or email address.</p>
        <div className="relative mt-3"><MdSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" aria-hidden="true" />
          <input id="patient-record-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} autoComplete="off" placeholder="Search patient name, phone or email" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200" />
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Patient list">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-bold">Patients</h2><p className="text-sm text-slate-600">{loadingList ? 'Searching…' : `${directory.total || 0} patient${Number(directory.total) === 1 ? '' : 's'} found`}</p>
        </div>
        {listError ? <div className="p-6"><Empty title="Unable to load patients" explanation={listError}/><button type="button" onClick={()=>setReload(x=>x+1)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 font-semibold text-white"><MdRefresh/> Try Again</button></div>
          : loadingList ? <p role="status" className="p-8 text-center text-base text-slate-600">Loading patients…</p>
            : !directory.patients?.length ? <div className="p-5"><Empty title="No matching patients" explanation={search ? 'Try a different name, phone number or email.' : 'No patients have been recorded for this branch.'}/></div>
              : <div className="divide-y divide-slate-100">{directory.patients.map(p => <div key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
                <Avatar name={p.name || p.full_name}/><div className="min-w-0 flex-1"><p className="break-words text-base font-bold text-slate-900">{p.name || p.full_name}</p><p className="mt-1 break-words text-sm text-slate-600">{p.phone || 'Phone not recorded'}</p><p className="break-words text-sm text-slate-500">{p.email || 'Email not recorded'}</p></div>
                <button type="button" onClick={()=>openPatient(p)} className="min-h-11 rounded-xl bg-slate-900 px-5 text-base font-bold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">View Record</button>
              </div>)}</div>}
        {!loadingList && !listError && Number(directory.totalPages) > 1 && <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6">
          <button type="button" disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-3 font-semibold disabled:opacity-40"><MdChevronLeft/> Previous</button>
          <span className="text-sm font-semibold text-slate-600">Page {page} of {directory.totalPages}</span>
          <button type="button" disabled={page>=directory.totalPages} onClick={()=>setPage(p=>p+1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-3 font-semibold disabled:opacity-40">Next <MdChevronRight/></button>
        </div>}
      </section>
    </> : <>
      <button type="button" onClick={backToList} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold text-sky-700 hover:bg-sky-50"><MdArrowBack aria-hidden="true"/> Back to Patient List</button>
      {loadingRecord ? <p role="status" className="rounded-2xl bg-white p-8 text-base text-slate-600">Loading patient record…</p>
        : recordError ? <div><Empty title="Unable to open patient record" explanation={recordError}/><button type="button" onClick={()=>openPatient(selected)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 font-semibold text-white"><MdRefresh/> Try Again</button></div>
          : patient && <>
            <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center gap-4"><Avatar name={patient.full_name}/><div className="min-w-0 flex-1">
                <h1 className="break-words text-2xl font-bold">{patient.full_name}</h1>
                <p className="mt-1 text-sm text-slate-600">Patient Record {age(patient.birthdate) !== null ? `· ${age(patient.birthdate)} years old` : ''}</p>
              </div>
              <button type="button" onClick={()=>{setTab('history');setOpenVisit(null)}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-5 text-base font-bold text-white hover:bg-sky-800"><MdHistory/> View Visit History</button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-sky-50 p-4"><p className="text-sm font-medium text-slate-600">{record.history_has_more ? 'Completed Visits Shown' : 'Completed Visits'}</p><p className="mt-1 text-2xl font-bold text-sky-900">{completed.length}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-medium text-slate-600">Last Completed Visit</p><p className="mt-1 text-base font-bold text-slate-900">{mostRecent ? formatDate(mostRecent.date) : 'None recorded'}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-medium text-slate-600">{canViewBilling ? 'Remaining Balance' : 'Upcoming Appointments'}</p><p className="mt-1 text-xl font-bold text-slate-900">{canViewBilling ? money(balance) : upcoming.length}</p></div>
              </div>
            </header>
            <nav aria-label="Patient record sections" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['history','Visit History & Treatments',MdHistory],['upcoming','Upcoming Appointments',MdCalendarToday],
                ...(canViewBilling ? [['payments','Payments & Receipts',MdPayments]] : []),['personal','Personal Information',MdPerson],
              ].map(([key,label,Icon]) => <button key={key} type="button" aria-current={tab===key ? 'page' : undefined} onClick={()=>{setTab(key);setOpenVisit(null)}}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-sm font-bold sm:text-base ${tab===key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}><Icon className="shrink-0 text-xl" aria-hidden="true"/>{label}</button>)}
            </nav>
            {tab === 'history' && (selectedVisit ? <VisitDetails visit={selectedVisit} bill={byAppointment.get(Number(selectedVisit.id))} canViewBilling={canViewBilling} clinicSettings={{...clinicSettings,...(record.receipt_clinic || {})}} onBack={()=>setOpenVisit(null)}/>
              : <section className="space-y-4"><div><h2 className="text-xl font-bold">Visit History & Treatments</h2><p className="mt-1 text-base text-slate-600">Choose a visit to see the doctor, services and related receipt.</p></div>
                {record.history_has_more && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This patient has more than 500 appointments. The latest 500 are shown; older records are not included here.</p>}
                {!completed.length ? <Empty title="No completed visits yet" explanation="Completed appointments will appear here once they are recorded by the clinic."/> : completed.map(visit => {
                  const bill = byAppointment.get(Number(visit.id))
                  return <article key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-sky-800">{formatDate(visit.date)}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{visitTitle(visit,bill)}</h3></div><Status value={visit.status}/></div>
                    <div className="mt-4 grid gap-3 text-base text-slate-700 sm:grid-cols-2"><p><span className="font-semibold">Doctor:</span> {visit.doctor_name || 'Not recorded'}</p><p><span className="font-semibold">Time:</span> {visit.time || 'Not recorded'}</p>
                    {canViewBilling && <p><span className="font-semibold">Payment:</span> {bill ? `${money(bill.paid_amount)} paid` : 'No bill recorded'}</p>}
                    {canViewBilling && <p><span className="font-semibold">Receipt:</span> {bill?.payments?.some(p=>p.receipt_number) ? 'Available in visit details' : 'Not recorded'}</p>}
                    </div>
                    <button type="button" onClick={()=>setOpenVisit(visit.id)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 text-base font-bold text-white hover:bg-sky-800 sm:w-auto">View Visit Details <MdChevronRight aria-hidden="true"/></button>
                  </article>
                })}
                {previous.length>0 && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-lg font-bold">Other Previous Appointments</h3><p className="mt-1 text-sm text-slate-600">Cancelled, missed, or unfinished visits are not counted as completed treatments.</p>
                  <div className="mt-4 space-y-3">{previous.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="font-semibold">{formatDate(v.date)}</p><p className="mt-1 text-sm text-slate-600">{v.reason || 'Clinic appointment'} · {v.doctor_name || 'Doctor not recorded'}</p></div><button type="button" onClick={()=>setOpenVisit(v.id)} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold text-slate-800">View Details</button><Status value={v.status}/></div>)}</div></section>}
              </section>)}
            {tab === 'upcoming' && <section className="space-y-4"><h2 className="text-xl font-bold">Upcoming Appointments</h2>{!upcoming.length ? <Empty title="No upcoming appointments" explanation="When the patient has a future appointment, it will appear here."/> : upcoming.map(v=><article key={v.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-bold">{formatDate(v.date)} · {v.time || 'Time not recorded'}</h3><Status value={v.status}/></div><p className="mt-2 text-base">Doctor: {v.doctor_name || 'Not recorded'}</p><p className="mt-1 text-sm text-slate-600">Requested: {v.requested_service_name_snapshot || v.reason || 'Not recorded'}</p></article>)}</section>}
            {tab === 'payments' && canViewBilling && <section className="space-y-4"><div><h2 className="text-xl font-bold">Payments & Receipts</h2><p className="mt-1 text-base text-slate-600">Choose a visit to see the itemized bill and print its payment receipts.</p></div>
              {!bills.length ? <Empty title="No bills recorded" explanation="When a bill is created for this patient in this branch, it will appear here."/> : bills.map(bill=><article key={bill.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{formatDate(bill.appointment_date)}</h3><p className="mt-1 text-sm text-slate-600">{bill.appointment_reason || 'Clinic visit'} · {bill.doctor_name || 'Doctor not recorded'}</p></div><Status value={bill.status}/></div>
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3"><Info label="Total bill" value={money(bill.total_amount)}/><Info label="Amount paid" value={money(bill.paid_amount)}/><Info label="Balance" value={money(bill.balance_amount)}/></dl>
                <p className="mt-3 text-sm text-slate-600">{(bill.payments || []).filter(p=>p.receipt_number).length} payment receipt(s)</p>
                <button type="button" onClick={()=>{setTab('history');setOpenVisit(bill.appointment_id)}} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-5 font-semibold text-white">View Bill & Receipts <MdChevronRight/></button>
              </article>)}
            </section>}
            {tab === 'personal' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Personal Information</h2><p className="mt-1 text-sm text-slate-600">Information provided during patient registration.</p><dl className="mt-6 grid gap-6 sm:grid-cols-2"><Info label="Full name" value={patient.full_name}/><Info label="Date of birth" value={patient.birthdate ? formatDate(patient.birthdate) : null}/><Info label="Sex" value={patient.sex}/><Info label="Civil status" value={patient.civil_status}/><Info label="Phone number" value={patient.phone}/><Info label="Email address" value={patient.email}/><div className="sm:col-span-2"><Info label="Home address" value={patient.address}/></div></dl></section>}
          </>}
    </>}
  </main>
}
