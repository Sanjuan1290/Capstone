import {promotionQuote,peso} from '../../utils/promotionPricing.mjs'
import { formatPublicServicePrice } from '../../utils/patientServicePresentation.mjs'
import { usePatientBranch } from '../../context/PatientBranchContext'
import useClinicRefresh from '../../hooks/useClinicRefresh'
// client/src/pages/patientPage/BookAppointment.jsx
// Four-step patient-facing flow. Existing backend validation is authoritative.

import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import {
  getMyAppointments, getAppointmentReasons, getBookingReadiness, getBookingServices, getCurrentPromotions, getDoctorsAvailability, getDoctorSchedule, getDoctorAvailableSlots, getDoctorUnavailableDates, bookAppointment,
} from '../../services/patient.service'
import { doctorClinicLabel } from '../../utils/doctor'
import { useAuth } from '../../context/AuthContext'
import { getSettings } from '../../services/portal.service'
import { getVerifiedPatientAccount, isSamePatientAccount } from '../../utils/patientEmailVerification.mjs'
import {
  MdCheck, MdChevronLeft, MdChevronRight, MdFace, MdMedicalServices,
  MdCalendarToday, MdAccessTime,
  MdArrowForward, MdWarning, MdRefresh, MdInfoOutline, MdLocalOffer,
} from 'react-icons/md'
import { getLocalDateOnly } from '../../utils/date'
import { readSlotPrefill } from '../../utils/bookingHandoff.mjs'
import { formatAppointmentTimeRange } from '../../utils/appointmentTime'
import { BOOKING_STEPS, normalizeBookingServiceResults, eligibleBookingPromotions, selectBookingPrice } from '../../utils/patientBookingFlow.mjs'
import { buildBookingPolicyUrl } from '../../utils/bookingPolicyNavigation.mjs'
import {
  buildUnavailableDateSet,
  isDoctorAvailableOnDate,
  scheduleSummary,
} from '../../utils/schedule'

// ── Constants ─────────────────────────────────────────────────────────────────
const CLINIC_TYPES = [
  { id: 'medical', label: 'General Medicine', desc: 'Check-ups, general health concerns, minor procedures.',   Icon: MdMedicalServices, from: 'from-sky-500',     to: 'to-sky-600',     light: 'bg-sky-50',     border: 'border-sky-200',     check: 'bg-sky-500'     },
  { id: 'derma',   label: 'Dermatology',      desc: 'Skin, hair & nail conditions, cosmetic procedures.',      Icon: MdFace,            from: 'from-emerald-500', to: 'to-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', check: 'bg-emerald-500' },
]
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS    = ['Su','Mo','Tu','We','Th','Fr','Sa']
const STEPS = BOOKING_STEPS
const BOOKING_PRICE_DISCLOSURE = 'The amount shown is an estimate based on your selected service and any eligible offer. Your final bill may change depending on the doctor’s assessment, additional treatments, and medicines or supplies used. The clinic will review additional charges with you before payment.'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }
function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m+1)}-${pad(d)}` }
function formatDuration(minutes) { const total=Number(minutes||60); const h=Math.floor(total/60), m=total%60; return [h?`${h} hr${h===1?'':'s'}`:'',m?`${m} min`:''].filter(Boolean).join(' ') }


// ── Four-step progress ──────────────────────────────────────────────────────
export const StepBar = ({ current, labels = STEPS }) => (
  <div className="mb-6" aria-label={`Step ${current + 1} of ${labels.length}: ${labels[current]}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold text-slate-800">Step {current + 1} of {labels.length}</p>
      <p className="text-sm text-emerald-700 font-semibold">{labels[current]}</p>
    </div>
    <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${labels.length},minmax(0,1fr))`}} role="list" aria-label="Booking progress">
      {labels.map((label, index) => (
        <div key={label} role="listitem" aria-current={index === current ? 'step' : undefined}>
          <div className={`h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none ${index <= current ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          <p className={`mt-2 text-center text-[11px] sm:text-xs font-semibold ${index === current ? 'text-emerald-800' : 'text-slate-500'}`}>
            {index < current ? <MdCheck className="mr-1 inline" aria-label="Done" /> : null}{label}
          </p>
        </div>
      ))}
    </div>
  </div>
)

// ── Step 1: Category and service selection in one screen ────────────────────
export const StepService = ({ category, onCategoryChange, value, onChange, services, promotions = [], promotionsLoading = false, branchId, readiness, readinessLoading, readinessError, loading, error, onRetry, onRetryReadiness }) => {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 6
  const filtered = services.filter(service =>
    (category === 'all' || service.booking_clinic_type === category) &&
    `${service.service_name} ${service.category || ''}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleServices = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => setPage(1), [category, query, branchId])
  return <div className="space-y-5">
    <div>
      <h2 className="text-xl font-bold text-slate-900">What service do you need?</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">Choose the treatment or consultation you want. You can change your selection before submitting.</p>
    </div>
    {readinessError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="font-bold">Booking availability could not be checked.</p>
      <p className="my-1">{readinessError}</p>
      <button type="button" onClick={onRetryReadiness} className="font-bold underline">Try again</button>
    </div>}
    <div className="flex flex-wrap gap-2" aria-label="Filter services by clinic type">
      {[{id:'all',label:'All Services'}, ...CLINIC_TYPES.map(item=>({id:item.id,label:item.label}))].map(item => (
        <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => onCategoryChange(item.id)}
          className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${category===item.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}>
          {item.label}
        </button>
      ))}
    </div>
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">Find a service</span>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by service name"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
    </label>
    {(loading || readinessLoading) && <p role="status" className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Loading available services…</p>}
    {!loading && error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">We couldn't load the services. <button type="button" onClick={onRetry} className="font-bold underline">Try again</button></div>}
    {!loading && !error && !readinessLoading && !filtered.length && <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-slate-900">{query ? 'No services match your search.' : category === 'all' ? 'No online services are available at this branch.' : `No active ${doctorClinicLabel(category)} services are available for online booking.`}</p>
      <p className="mt-1 text-sm text-slate-600">Try another category or contact the clinic for help.</p>
    </div>}
    <div className="grid gap-3 md:grid-cols-2">
      {!loading && !error && visibleServices.map(service => {
        const selected = Number(value?.id)===Number(service.id) && value?.booking_clinic_type===service.booking_clinic_type
        const clinic = CLINIC_TYPES.find(c=>c.id===service.booking_clinic_type)
        const bookable = !readinessError && Boolean(readiness?.[service.booking_clinic_type]?.bookable)
        const preview = selectBookingPrice(service, promotions, { branchId, date: getLocalDateOnly(), fallbackCurrentOffer: promotionsLoading })
        return <button key={`${service.booking_clinic_type}:${service.id}`} type="button" disabled={!bookable} aria-pressed={selected}
          onClick={() => onChange(service)} className={`flex min-h-40 flex-col rounded-2xl border-2 p-4 text-left transition-all duration-200 motion-reduce:transition-none ${!bookable ? 'cursor-not-allowed opacity-60' : 'hover:shadow-md'} ${selected ? 'border-emerald-600 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
          <div className="flex w-full items-start justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">{clinic?.label || 'Clinic service'}</span>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{selected && <MdCheck aria-hidden="true" />}</span>
          </div>
          <p className="mt-2 break-words text-base font-bold text-slate-900">{service.service_name}</p>
          <p className="mt-1 text-sm text-slate-600">{service.category || 'Consultation or treatment'}</p>
          {preview.quote?.discount > 0 ? <div className="mt-2 space-y-0.5" aria-label="Special offer price">
            <p className="text-xs font-bold text-emerald-700"><MdLocalOffer className="mr-1 inline" />{preview.promotion.title} · {preview.promotion.discount_type === 'percentage' ? `${preview.promotion.discount_value}% OFF` : `Save ${peso(preview.quote.discount)}`}</p>
            <p className="text-sm"><span className="mr-2 text-slate-500 line-through">{peso(preview.quote.original)}</span><strong className="text-emerald-800">{peso(preview.quote.current)}</strong></p>
            <p className="text-[11px] text-slate-500">Expected discounted price. Eligibility depends on your appointment date; final charges may vary.</p>
          </div> : <p className="mt-2 text-sm font-bold text-emerald-800">Expected service price: {formatPublicServicePrice(service)}</p>}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4 text-sm">
            <span className="text-slate-600">{formatDuration(service.average_duration_minutes)} estimated</span>
            <span className="font-semibold text-emerald-800">{selected ? 'Selected' : bookable ? 'Select service' : 'Not available'}</span>
          </div>
        </button>
      })}
    </div>
    {!loading && !error && filtered.length > PAGE_SIZE && <nav aria-label="Service pagination" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-600">Showing {(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE, filtered.length)} of {filtered.length} services</p>
      <div className="flex items-center gap-2">
        <button type="button" className="button-secondary" disabled={currentPage===1} onClick={() => setPage(currentPage-1)}>Previous</button>
        <span className="text-xs font-semibold text-slate-700">Page {currentPage} of {totalPages}</span>
        <button type="button" className="button-secondary" disabled={currentPage===totalPages} onClick={() => setPage(currentPage+1)}>Next</button>
      </div>
    </nav>}
    {value && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Selected service: <strong>{value.service_name}</strong>. {BOOKING_PRICE_DISCLOSURE}</p>}
  </div>
}

// Estimated prices are informational. Booking and cashier APIs make the final decision.
const BookingPriceNotice = ({ service, promotion, date }) => {
  const quote = promotionQuote(service?.default_price, promotion)
  if (!service || !promotion || !(quote?.discount > 0)) return null
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm" aria-label="Your selected offer">
    <p className="font-bold text-emerald-900"><MdLocalOffer className="mr-1 inline" />{promotion.title}</p>
    <p className="mt-1"><span className="mr-2 text-slate-500 line-through">{peso(quote.original)}</span><strong className="text-emerald-800">{peso(quote.current)}</strong> <span className="text-emerald-800">(save {peso(quote.discount)})</span></p>
    <p className="mt-1 text-xs text-slate-600">{date ? `Offer valid for your selected appointment date: ${date}.` : 'Final eligibility depends on your appointment date.'} Additional charges are billed separately.</p>
  </div>
}

// ── Step 3: Doctor ────────────────────────────────────────────────────────────
export const StepDoctor = ({ clinicType, value, onChange, doctorList, loadingDoctors, doctorError, onRetry, service, promotion }) => {
  const list = doctorList[clinicType] || []
  const ct = CLINIC_TYPES.find(c => c.id === clinicType)
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Select a Doctor</h2>
        <p className="text-sm text-slate-500 mt-0.5">Doctors available for {ct?.label}.</p>
      </div>
      <BookingPriceNotice service={service} promotion={promotion} />
      {loadingDoctors && <div className="py-10 text-center text-slate-400 text-sm">Loading available doctors...</div>}
      {!loadingDoctors && doctorError && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-600">We couldn't load doctors.<button onClick={onRetry} className="ml-2 font-bold">Try again</button></div>}
      {!loadingDoctors && !doctorError && list.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p className="font-bold text-slate-700">No doctors are currently available for {ct?.label}.</p><p className="mt-1 text-xs text-slate-400">Choose another clinic type or check again later.</p></div>}
      {list.map(doc => (
        <button key={doc.id} onClick={() => onChange(doc)}
          className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.99]
            ${value?.id===doc.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-base
            ${value?.id===doc.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {(doc.full_name||doc.name).replace(/^Dr\.?\s*/i,'').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()||'DR'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-800 truncate">{doc.full_name||doc.name}</p>
            <div className="mt-1 text-xs text-slate-500">
              <p><span className="font-semibold text-slate-600">Clinic Assignment:</span> {ct?.label || doctorClinicLabel(doc)}</p>
            </div>
            {(doc.weekly_schedule||[]).filter(s=>Number(s.is_active)!==0).length>0 ? <p className="mt-1 text-[11px] text-emerald-600">{(doc.weekly_schedule||[]).filter(s=>Number(s.is_active)!==0).slice(0,3).map(s=>s.day_of_week.slice(0,3)).join(', ')} · {scheduleSummary((doc.weekly_schedule||[]).find(s=>Number(s.is_active)!==0))}</p> : <p className="mt-1 text-[11px] font-semibold text-amber-600">No online schedule configured</p>}
            {doc.next_available && <p className="mt-1 text-[11px] font-bold text-emerald-700">Next available: {doc.next_available.date} · {doc.next_available.time}</p>}
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
            ${value?.id===doc.id ? 'bg-emerald-500 border-transparent' : 'border-slate-300 bg-white'}`}>
            {value?.id===doc.id && <MdCheck className="text-white text-[13px]" />}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Step 4: Schedule ──────────────────────────────────────────────────────────
export const StepSchedule = ({ date, time, onDateChange, onTimeChange, timeSlots, doctorSchedules, unavailableDates, loadingSlots, slotsError, service, promotion, hasCurrentServiceOffer = false }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) {
      const [year, month] = date.split('-').map(Number)
      setViewYear(year); setViewMonth(month-1)
    }
  }, [date])
  const blockedDates = buildUnavailableDateSet(unavailableDates)

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]

  const isPast = d => new Date(viewYear,viewMonth,d) < new Date(today.getFullYear(),today.getMonth(),today.getDate())
  const isUnavailable = d => {
    const dateString = toISO(viewYear, viewMonth, d)
    if (blockedDates.has(dateString)) return true
    if (!doctorSchedules?.length) return false
    return !isDoctorAvailableOnDate(dateString, doctorSchedules, unavailableDates)
  }
  const isSelected = d => date === toISO(viewYear,viewMonth,d)
  const isToday    = d => d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear()

  const prevM = () => { if (viewYear===today.getFullYear() && viewMonth===today.getMonth()) return; if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  const nextM = () => { if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  const todayStr = getLocalDateOnly(today)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Pick a Date & Time</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select a date then choose an available slot.</p>
      </div>
      <BookingPriceNotice service={service} promotion={promotion} date={date} />
      {service && date && !promotion && hasCurrentServiceOffer && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your selected date is outside the available promotion dates. The regular service price of <strong>{formatPublicServicePrice(service)}</strong> will apply. Choose a different date to use an eligible offer.</p>}

      {/* Calendar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" aria-label="Previous month" disabled={viewYear===today.getFullYear() && viewMonth===today.getMonth()} onClick={prevM}
            className="w-11 h-11 disabled:opacity-30 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronLeft className="text-slate-500 text-[20px]" />
          </button>
          <p className="text-sm font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</p>
          <button type="button" aria-label="Next month" onClick={nextM}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronRight className="text-slate-500 text-[20px]" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => <p key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</p>)}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />
            const past = isPast(d), unavail = isUnavailable(d)
            const sel  = isSelected(d), td = isToday(d)
            const disabled = past || unavail
            return (
              <button key={d} type="button" aria-label={`${MONTHS[viewMonth]} ${d}, ${viewYear}${disabled ? ", unavailable" : ""}`} aria-pressed={sel} disabled={disabled}
                onClick={() => { onDateChange(toISO(viewYear,viewMonth,d)); onTimeChange('') }}
                className={`min-h-11 w-full rounded-xl text-sm font-semibold transition-all
                  ${sel ? 'bg-[#0b1a2c] text-emerald-400 font-black shadow-md ring-2 ring-emerald-400/20' : ''}
                  ${!sel && td && !disabled ? 'ring-2 ring-emerald-400 text-emerald-700 bg-emerald-50' : ''}
                  ${!sel && !td && !disabled ? 'hover:bg-emerald-50 hover:text-emerald-700 text-slate-700' : ''}
                  ${disabled ? 'text-slate-300 cursor-not-allowed' : ''}`}>
                {d}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-emerald-50 ring-2 ring-emerald-400 inline-block" /> Today
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-[#0b1a2c] inline-block" /> Selected
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-slate-100 inline-block" /> Unavailable
          </span>
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <MdAccessTime className="text-[13px]" /> Available Time Slots
          </p>
          {loadingSlots ? <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Checking available times…</p> : slotsError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{slotsError} Please choose another date or try again.</p>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-5 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-sm text-slate-400">
                {date===todayStr ? 'No more slots for today. Pick another date.' : 'No slots available.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {timeSlots.map(slot => (
                <button key={slot} type="button" aria-pressed={time===slot} onClick={() => onTimeChange(slot)}
                  className={`min-h-11 py-3 rounded-xl text-sm font-semibold transition-all border-2
                    ${time===slot ? 'bg-[#0b1a2c] text-emerald-400 border-transparent shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'}`}>
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 5: Details ───────────────────────────────────────────────────────────
export const StepDetails = ({ reason, reasonDetails, notes, reasonOptions, loadingReasons, onReasonChange, onReasonDetailsChange, onNotesChange }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-bold text-slate-800">Visit Details</h2>
      <p className="text-sm text-slate-500 mt-0.5">Choose a visit reason. Use Additional Notes for any extra details.</p>
    </div>
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
        Reason for Visit <span className="text-red-400">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(reasonOptions || []).map((option) => (
          <button key={option.id || option.label} onClick={() => onReasonChange(option.label)}
            className={`p-3 rounded-2xl text-xs font-semibold text-left border-2 transition-all active:scale-[0.98]
              ${reason===option.label ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'}`}>
            {option.label}
          </button>
        ))}
      </div>
      {loadingReasons && (
        <p className="mt-2 text-xs text-slate-400">Loading reason options…</p>
      )}
      {!loadingReasons && reasonOptions?.length === 1 && reasonOptions[0]?.label === 'Other' && (
        <p className="mt-2 text-xs font-semibold text-amber-700">No custom visit reasons are configured yet. You can still continue by selecting Other and explaining your concern.</p>
      )}
    </div>
    {reason === 'Other' && (
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
          Please Describe Your Reason <span className="text-red-400">*</span>
        </label>
        <textarea value={reasonDetails} onChange={e => onReasonDetailsChange(e.target.value)} rows={3}
          maxLength={180}
          placeholder="Briefly describe what you would like the doctor to check…"
          className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10 transition-all resize-none" />
        <p className="mt-1 text-[11px] text-slate-400">Required when you choose Other.</p>
      </div>
    )}
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
        Additional Notes <span className="normal-case font-normal text-slate-300">(optional)</span>
      </label>
      <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={3}
        placeholder="Any symptoms, concerns, or information the doctor should know…"
        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
          rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 focus:ring-2
          focus:ring-emerald-400/10 transition-all resize-none" />
    </div>
  </div>
)

// ── Step 4: Visit details, eligible offers, and final review ─────────────────
const StepReview = ({ form, branchName, promotions, selectedPromotionId, onPromotionChange, reasonOptions, loadingReasons, onReasonChange, onReasonDetailsChange, onNotesChange, policyAccepted, onPolicyAcceptedChange }) => {
  const applicable = eligibleBookingPromotions(promotions, {branchId:form.branchId,serviceId:form.service?.id,date:form.date})
  const chosen=applicable.find(p=>Number(p.id)===Number(selectedPromotionId))
  const quote=promotionQuote(form.service?.default_price,chosen)
  const policyUrl = buildBookingPolicyUrl({
    branchId: form.branchId,
    clinicType: form.clinicType,
    serviceId: form.service?.id,
    doctorId: form.doctor?.id,
  })
  return <div className="space-y-6">
    <div>
      <h2 className="text-xl font-bold text-slate-900">Review your appointment request</h2>
      <p className="mt-1 text-sm text-slate-600">Tell the doctor why you're visiting, then check your booking details.</p>
    </div>
    <StepDetails reason={form.reason} reasonDetails={form.reasonDetails} notes={form.notes}
      reasonOptions={reasonOptions} loadingReasons={loadingReasons}
      onReasonChange={onReasonChange} onReasonDetailsChange={onReasonDetailsChange} onNotesChange={onNotesChange} />
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:hidden">
      <BookingSummary form={form} branchName={branchName} selectedPromotion={applicable.find(p=>Number(p.id)===Number(selectedPromotionId))} />
    </div>
    {applicable.length > 0 && <fieldset className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <legend className="px-1 text-base font-bold text-amber-900">Available offers (optional)</legend>
      <p className="mb-3 text-sm text-amber-900">Choose an offer for this appointment date. The service discount is applied automatically when the booked service is billed.</p>
      {quote?.discount>0 && <p className="mb-3 rounded-xl bg-white p-3 text-sm"><span className="line-through text-slate-500">{peso(quote.original)}</span> <strong className="ml-2 text-emerald-700">{peso(quote.current)}</strong> · Save {peso(quote.discount)}</p>}
      {[null,...applicable].map(promo=><label key={promo?.id || 'none'} className="mb-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 text-sm">
        <input type="radio" className="mt-1 h-4 w-4 accent-emerald-700" name="booking_promotion" checked={String(selectedPromotionId||'')===String(promo?.id||'')} onChange={()=>onPromotionChange(promo?.id || null)} />
        <span><strong className="block text-slate-900">{promo?.title || 'No offer'}</strong>{promo && <span className="mt-1 block text-slate-600">{promo.description} · Valid through {promo.ends_on}</span>}</span>
      </label>)}
    </fieldset>}
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-emerald-950">Before you submit</h3>
          <p className="mt-1 text-sm leading-6 text-emerald-900">Please read the clinic rules for arriving, changing an appointment, and missed visits.</p>
        </div>
        <a href={policyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-100">
          Read Booking Policy <MdArrowForward />
        </a>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm text-emerald-950">
        <input type="checkbox" checked={policyAccepted} onChange={e=>onPolicyAcceptedChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700" />
        <span>I have read and agree to the clinic's Appointment Booking Policy. I understand this is a request and the clinic must confirm it.</span>
      </label>
    </div>
  </div>
}

// A quick reference stays visible throughout booking; it does not create a reservation.
export const BookingSummary = ({ form, branchName, selectedPromotion }) => {
  const quote = promotionQuote(form.service?.default_price, selectedPromotion)
  const hasDiscount = Boolean(selectedPromotion && quote?.discount > 0)
  const dateText = form.date && /^\d{4}-\d{2}-\d{2}$/.test(form.date)
    ? new Date(`${form.date}T12:00:00`).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : 'Not selected yet'
  return <div className="space-y-4">
    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><MdCalendarToday className="text-emerald-700" /> Your Appointment</h2>
    {[
      ['Clinic Branch',branchName],
      ['Service',form.service?.service_name || 'Not selected yet'],
      ['Expected Service Price',form.service ? (hasDiscount ? peso(quote.current) : formatPublicServicePrice(form.service)) : 'Not selected yet'],
      ['Doctor',form.doctor?.full_name || form.doctor?.name || 'Not selected yet'],
      ['Date',dateText],
      ['Time',form.time ? formatAppointmentTimeRange(form.time,form.service?.reserved_duration_minutes || 60) : 'Not selected yet'],
    ].map(([label,value])=><div key={label} className="border-b border-slate-200 pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>)}
    {hasDiscount && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" aria-label="Appointment promotion price">
      <p className="font-semibold"><MdLocalOffer className="mr-1 inline" />{selectedPromotion.title}</p>
      <p className="mt-1"><span className="line-through text-slate-500">{peso(quote.original)}</span> <strong className="ml-2">{peso(quote.current)}</strong></p>
      <p className="mt-1 text-xs">Promotion discount: −{peso(quote.discount)} · Only applies to this service.</p>
      {!form.date && <p className="mt-1 text-xs">Final discount eligibility depends on your appointment date.</p>}
    </div>}
    {selectedPromotion && !hasDiscount && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><MdLocalOffer className="mr-1 inline" /> Selected offer: {selectedPromotion.title} (no automatic price reduction)</p>}
    {form.service && <div role="note" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-relaxed text-sky-900">
      <p className="font-bold"><MdInfoOutline className="mr-1 inline" /> Service price is an estimate</p>
      <p className="mt-1">{BOOKING_PRICE_DISCLOSURE}</p>
    </div>}
    <p className="text-xs leading-relaxed text-slate-600">The clinic confirms appointment availability. Submitting a booking request does not finalize your bill or deduct supplies.</p>
  </div>
}

// ── Success ───────────────────────────────────────────────────────────────────
const SuccessScreen = ({ onReset, form, branchName, selectedPromotion }) => (
  <div className="flex flex-col items-center text-center py-10">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Request Submitted!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed">
      Your requested time is pending clinic confirmation. You can track the status in <strong>My Appointments</strong>.
    </p>
    <div className="mb-5 w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm">
      <p className="font-bold text-amber-900">Status: Pending Clinic Confirmation</p>
      <p className="mt-2 text-slate-800">{form.service?.service_name} · {form.doctor?.full_name || form.doctor?.name}</p>
      {selectedPromotion && promotionQuote(form.service?.default_price, selectedPromotion)?.discount > 0 ? <div className="mt-2 text-sm">
        <p className="font-semibold text-emerald-900">{selectedPromotion.title}: <span className="line-through text-slate-500">{peso(form.service.default_price)}</span> {peso(promotionQuote(form.service.default_price, selectedPromotion).current)}</p>
        <p className="text-xs text-slate-600">Expected discounted service price · Discount: −{peso(promotionQuote(form.service.default_price, selectedPromotion).discount)}</p>
      </div> : <p className="mt-1 font-semibold text-emerald-900">Expected service price: {formatPublicServicePrice(form.service)}</p>}
      {form.service && <p className="mt-2 text-xs leading-relaxed text-amber-950">{BOOKING_PRICE_DISCLOSURE}</p>}
      <p className="mt-1 text-slate-700">{branchName} · {form.date} · {form.time}</p>
    </div>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button onClick={onReset}
        className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
        Book Another
      </button>
      <NavLink to="/patient/appointments"
        className="flex-1 py-3 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors text-center">
        My Appointments
      </NavLink>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const BookAppointment = () => {
  const [step, setStep] = useState(0)
  const [serviceCategory, setServiceCategory] = useState('all')
  const bookingContentRef = useRef(null)
  const lastFocusedStep = useRef(0)
  const servicesRequestId = useRef(0)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const { user, setUser } = useAuth()
  const [emailStatus, setEmailStatus] = useState('checking')
  const [emailStatusError, setEmailStatusError] = useState('')
  const emailStatusRequestId = useRef(0)
  const [activeVisits, setActiveVisits] = useState([])
  const [bookingNotice, setBookingNotice] = useState('')
  const [checkingVisits, setCheckingVisits] = useState(true)
  const { branches, branchId, selectBranch } = usePatientBranch()
  const branchError = ''
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    clinicType: '', service: null, doctor: null, date: null, time: '', reason: '', reasonDetails: '', notes: '',
  })
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const bookingSubmissionLock = useRef(false)
  const [doctorList,      setDoctorList]      = useState({ medical: [], derma: [] })
  const [loadingDoctors, setLoadingDoctors] = useState(true)
  const [doctorError, setDoctorError] = useState('')
  const [searchParams] = useSearchParams()
  const [timeSlots,       setTimeSlots]       = useState([])
  const [doctorSchedules, setDoctorSchedules] = useState([])
  const [doctorUnavailableDates, setDoctorUnavailableDates] = useState([])
  const [reasonOptions, setReasonOptions] = useState([])
  const [loadingReasons, setLoadingReasons] = useState(false)
  const [services, setServices] = useState([])
  const [promotions, setPromotions] = useState([])
  const [promotionsLoading, setPromotionsLoading] = useState(true)
  const [promotionsError, setPromotionsError] = useState('')
  const promotionsRequestId = useRef(0)
  const [selectedPromotionId, setSelectedPromotionId] = useState(null)
  const linkedPromotionConsumed = useRef(false)
  const linkedPromotionId = /^[1-9]\d*$/.test(searchParams.get('promotion_id') || '') ? Number(searchParams.get('promotion_id')) : null
  const [loadingServices, setLoadingServices] = useState(false)
  const [serviceError, setServiceError] = useState('')
  const [bookingReadiness, setBookingReadiness] = useState(null)
  const [loadingReadiness, setLoadingReadiness] = useState(true)
  const [readinessError, setReadinessError] = useState('')
  const readinessRequestId = useRef(0)
  const doctorsRequestId = useRef(0)

  // Email verification is recommended but never required for booking.
  // Refresh the persisted account status to show an accurate warning without
  // relying on a cached login response or interrupting the booking flow.
  const patientId = user?.id
  const refreshEmailVerification = useCallback(async () => {
    const requestId = ++emailStatusRequestId.current
    setEmailStatus('checking')
    setEmailStatusError('')
    if (!patientId) return
    try {
      const current = await getSettings('patient')
      const status = getVerifiedPatientAccount(current, patientId)
      if (requestId !== emailStatusRequestId.current) return
      setUser((prev) => isSamePatientAccount(current, prev?.id)
        ? { ...prev, email: current.email, email_verified_at: current.email_verified_at || null, phone_verified_at: current.phone_verified_at || null }
        : prev)
      setEmailStatus(status)
    } catch (error) {
      if (requestId !== emailStatusRequestId.current) return
      setEmailStatusError(error.message || 'Unable to confirm email status.')
      setEmailStatus('error')
    }
  }, [patientId, setUser])

  useEffect(() => {
    refreshEmailVerification()
    const onFocus = () => { if (!document.hidden) refreshEmailVerification() }
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshEmailVerification() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      emailStatusRequestId.current += 1
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshEmailVerification])

  useEffect(() => {
    let current = true
    setCheckingVisits(true)
    getMyAppointments().then((rows) => {
      if (!current) return
      setActiveVisits((Array.isArray(rows) ? rows : []).filter((appt) =>
        ['pending', 'confirmed', 'rescheduled', 'in-progress'].includes(String(appt.status || '').toLowerCase())))
    }).catch(() => { if (current) setActiveVisits([]) }).finally(() => { if (current) setCheckingVisits(false) })
    return () => { current = false }
  }, [])
  const matchingActiveDoctor = (doctor) => activeVisits.find((visit) => Number(visit.doctor_id) === Number(doctor?.id))
  const selectDoctorSafely = (doctor) => {
    const existing = matchingActiveDoctor(doctor)
    if (existing) {
      setBookingNotice(`You already have an active appointment with ${doctor?.full_name || doctor?.name || 'this doctor'}. Please review your booking in My Appointments before making another one.`)
      return
    }
    setForm((current) => ({...current, doctor, date: current.doctor?.id===doctor?.id?current.date:(searchParams.get('follow_up_id') ? readSlotPrefill(searchParams,getLocalDateOnly()).date : null), time: current.doctor?.id===doctor?.id?current.time:''}))
  }

  const loadBookingReadiness = async () => {
    const requestId = ++readinessRequestId.current
    const requestedBranch = branchId
    setLoadingReadiness(true)
    setReadinessError('')
    try {
      const result = await getBookingReadiness(branchId)
      if (requestId === readinessRequestId.current && requestedBranch === branchId) setBookingReadiness(result || null)
    } catch {
      // Keep last known readiness and the user's draft; never interpret a failed API as empty setup.
      if (requestId === readinessRequestId.current) setReadinessError('Unable to check booking availability right now. Please retry. Your selections are saved on this page.')
    } finally {
      if (requestId === readinessRequestId.current) setLoadingReadiness(false)
    }
  }

  useEffect(() => {
    if (branchId) {
      setBookingReadiness(null)
      loadBookingReadiness()
    }
    return () => { readinessRequestId.current += 1 }
  }, [branchId])
  // Registered patients may use eligible offers regardless of email/SMS verification.
  // Guest booking uses a separate public flow without promotions.
  const qualifiesForExclusiveOffers=Boolean(patientId && !Number(user?.is_walk_in || 0))
  const bookablePromotions=qualifiesForExclusiveOffers ? promotions : []

  const loadPromotions=()=>{
    const requestId=++promotionsRequestId.current
    const requestedBranch=branchId
    setPromotionsLoading(true)
    setPromotionsError('')
    if(!requestedBranch){setPromotions([]);setPromotionsLoading(false);return Promise.resolve()}
    return getCurrentPromotions(requestedBranch)
      .then(rows=>{if(requestId===promotionsRequestId.current)setPromotions(Array.isArray(rows)?rows.filter(p=>Number(p.branch_id)===Number(requestedBranch)):[])})
      .catch(()=>{if(requestId===promotionsRequestId.current){setPromotions([]);setPromotionsError('Current offers could not be checked. Please retry before booking a discounted service.')}})
      .finally(()=>{if(requestId===promotionsRequestId.current)setPromotionsLoading(false)})
  }
  useEffect(() => {setPromotions([]);setSelectedPromotionId(null);void loadPromotions();return ()=>{promotionsRequestId.current+=1}}, [branchId])
  useEffect(()=>{
    if(!form.service){setSelectedPromotionId(null);return}
    const applicable=eligibleBookingPromotions(bookablePromotions,{branchId,serviceId:form.service.id,date:form.date || getLocalDateOnly()})
      .filter(p=>Number(p.is_active ?? 1)!==0 && p.starts_on<=getLocalDateOnly() && p.ends_on>=getLocalDateOnly())
    setSelectedPromotionId(current=>{
      if(current && applicable.some(p=>Number(p.id)===Number(current)))return current
      if(!linkedPromotionConsumed.current && linkedPromotionId && applicable.some(p=>Number(p.id)===linkedPromotionId)){linkedPromotionConsumed.current=true;return linkedPromotionId}
      return selectBookingPrice(form.service,applicable,{branchId,date:form.date || getLocalDateOnly()}).promotion?.id || null
    })
  },[form.service?.id,form.date,branchId,promotions,qualifiesForExclusiveOffers])
  useEffect(()=>{
    if(!form.date || !selectedPromotionId)return
    const offer=bookablePromotions.find(p=>Number(p.id)===Number(selectedPromotionId))
    if(!offer || form.date<offer.starts_on || form.date>offer.ends_on || offer.starts_on>getLocalDateOnly() || offer.ends_on<getLocalDateOnly())setSelectedPromotionId(null)
  },[form.date,selectedPromotionId,promotions,qualifiesForExclusiveOffers])
  useClinicRefresh(loadPromotions,['promotion.updated','service.updated'],{fallbackMs:90000})

  const loadDoctors = async () => {
    const requestId = ++doctorsRequestId.current
    setLoadingDoctors(true); setDoctorError('')
    try {
      const summary = await getDoctorsAvailability({ startDate: getLocalDateOnly(), days: 7, branchId })
      const enriched = Array.isArray(summary?.doctors) ? summary.doctors : []
      const doctorClinic = (d) => String(d.clinic_type || '')
      const derma = enriched.filter(d => doctorClinic(d) === 'derma' && d.weekly_schedule.some(x => Number(x.is_active)!==0))
      const medical = enriched.filter(d => doctorClinic(d) === 'medical' && d.weekly_schedule.some(x => Number(x.is_active)!==0))
      if (requestId !== doctorsRequestId.current) return
      setDoctorList({ medical, derma })
      const preDoctor = Number(searchParams.get('doctor')); const preClinic = searchParams.get('clinic')
      if (preDoctor && ['medical','derma'].includes(preClinic)) {
        const found = enriched.find(d => Number(d.id)===preDoctor && String(d.clinic_type || '') === preClinic)
        if (found) {
          const prefill = readSlotPrefill(searchParams, getLocalDateOnly())
          setForm(f => ({...f, clinicType:preClinic, doctor:found, date:prefill.date, time:prefill.time}))
        }
      }
    } catch (err) { if (requestId === doctorsRequestId.current) { setDoctorError(err.message || 'Failed to load doctors.'); setDoctorList({medical:[],derma:[]}) } }
    finally { if (requestId === doctorsRequestId.current) setLoadingDoctors(false) }
  }
  useEffect(() => { if(branchId)loadDoctors(); return () => { doctorsRequestId.current += 1 } }, [branchId])

  useEffect(() => {
    if (!form.clinicType || !bookingReadiness) return
    if (bookingReadiness?.[form.clinicType]?.bookable) return
    // A configuration change disables submission without discarding a patient's draft.
    setStep(0)
  }, [bookingReadiness, form.clinicType])

  // Marketing deep links only preselect a service type. Availability and eligibility
  // are still checked by the existing booking APIs before submission.
  useEffect(() => {
    const requestedBranch = searchParams.get('branch_id')
    const requestedClinic = searchParams.get('clinic')
    if (branchId && requestedBranch === String(branchId) && ['medical','derma'].includes(requestedClinic) && (searchParams.get('service_id') || searchParams.get('doctor'))) {
      setForm(current => ({...current, clinicType: requestedClinic}))
    }
  }, [branchId,searchParams])

  // Services in both categories are shown on the same first step. The selected
  // service carries the concrete clinic type needed by booking APIs.
  const loadServices = async () => {
    const requestId = ++servicesRequestId.current
    const requestedBranch = branchId
    if (!requestedBranch) { setServices([]); return }
    setLoadingServices(true); setServiceError('')
    const categories = ['medical','derma']
    try {
      const results = await Promise.allSettled(categories.map(clinicType=>getBookingServices(clinicType,requestedBranch)))
      if (requestId !== servicesRequestId.current || requestedBranch !== branchId) return
      const rows = normalizeBookingServiceResults(results)
      setServices(rows)
      if (results.every(result=>result.status === 'rejected')) setServiceError('Services are temporarily unavailable. Please try again.')
      const wanted = Number(searchParams.get('service_id'))
      const preferred = searchParams.get('clinic')
      if (wanted > 0 && searchParams.get('branch_id')===String(requestedBranch)) {
        const matched = rows.find(row => Number(row.id)===wanted && (!preferred || row.booking_clinic_type===preferred))
        if (matched) {
          const clinicType = matched.booking_clinic_type
          setForm(current => ({...current, clinicType, service:matched, doctor: current.doctor?.clinic_type === clinicType ? current.doctor : null, date: current.doctor?.clinic_type === clinicType ? current.date : null, time: current.doctor?.clinic_type === clinicType ? current.time : ''}))
          setServiceCategory(clinicType)
          setStep(1)
        }
      }
    } catch (error) {
      if (requestId===servicesRequestId.current) setServiceError(error.message || 'Unable to load services.')
    } finally {
      if (requestId===servicesRequestId.current) setLoadingServices(false)
    }
  }
  useEffect(() => {
    setServices([])
    setServiceCategory('all')
    setForm(current=>({ ...current, service:null, doctor:null, date:null, time:'', clinicType:'' }))
    if (branchId) void loadServices()
    return ()=>{ servicesRequestId.current += 1 }
  }, [branchId])

  const selectService = (service) => {
    const clinicType = service.booking_clinic_type
    setForm(current => ({ ...current,
      clinicType, service,
      doctor: current.doctor?.clinic_type === clinicType ? current.doctor : null,
      date: Number(current.service?.id)===Number(service.id) && current.clinicType===clinicType ? current.date : null,
      time: Number(current.service?.id)===Number(service.id) && current.clinicType===clinicType ? current.time : '',
      reason: '', reasonDetails: ''
    }))
    setSelectedPromotionId(null)
  }
  const selectCategory = nextCategory => {
    setServiceCategory(nextCategory)
    if (nextCategory !== 'all' && form.clinicType && form.clinicType !== nextCategory) {
      setForm(current=>({...current,clinicType:'',service:null,doctor:null,date:null,time:'',reason:'',reasonDetails:''}))
      setSelectedPromotionId(null)
    }
  }

  useEffect(() => {
    if (!form.clinicType) {
      setReasonOptions([])
      return
    }

    setLoadingReasons(true)
    getAppointmentReasons(form.clinicType,branchId)
      .then((rows) => setReasonOptions(Array.isArray(rows) && rows.length ? rows : [{ id:'system-other', label:'Other' }]))
      .catch(() => setReasonOptions([{ id:'system-other', label:'Other' }]))
      .finally(() => setLoadingReasons(false))
  }, [form.clinicType,branchId])

  useEffect(() => {
    if (!form.doctor) {
      setDoctorSchedules([])
      setDoctorUnavailableDates([])
      setTimeSlots([])
      return
    }

    let cancelled = false
    setDoctorSchedules([]); setDoctorUnavailableDates([]); setTimeSlots([])
    Promise.all([
      getDoctorSchedule(form.doctor.id, branchId),
      getDoctorUnavailableDates(form.doctor.id, { branchId }),
    ])
      .then(([schedules, blockedDates]) => {
        if (cancelled) return
        setDoctorSchedules(Array.isArray(schedules) ? schedules : [])
        setDoctorUnavailableDates(Array.isArray(blockedDates) ? blockedDates : [])
      })
      .catch(() => {
        if (cancelled) return
        setDoctorSchedules([]); setDoctorUnavailableDates([])
      })
    return () => { cancelled = true }
  }, [form.doctor, branchId])

  useEffect(() => {
    if (!form.doctor || !form.service || !form.date || !doctorSchedules.length) { setTimeSlots([]); setLoadingSlots(false); return }
    if (!isDoctorAvailableOnDate(form.date, doctorSchedules, doctorUnavailableDates)) {
      setTimeSlots([])
      return
    }

    let cancelled = false
    setLoadingSlots(true); setSlotsError(''); setTimeSlots([])
    getDoctorAvailableSlots(form.doctor.id, {
      date: form.date,
      serviceId: form.service.id,
      clinicType: form.clinicType,
      branchId,
    })
      .then((result) => {
        if (cancelled) return
        const available = Array.isArray(result?.slots) ? result.slots : []
        setTimeSlots(available)
        setForm((prev) => (prev.time && !available.includes(prev.time) ? { ...prev, time: '' } : prev))
      })
      .catch(() => {
        if (!cancelled) { setTimeSlots([]); setSlotsError('Unable to check available times right now.') }
      })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })

    return () => { cancelled = true }
  }, [form.date, form.doctor, form.service, form.clinicType, doctorSchedules, doctorUnavailableDates, branchId])

  const set = key => val => setForm(f => ({ ...f, [key]: val }))

  const canNext = () => {
    if (loadingReadiness || readinessError || promotionsLoading) return false
    if (promotionsError && form.service?.current_offer) return false
    if (step===0) return !!form.service && !!form.clinicType && Boolean(bookingReadiness?.[form.clinicType]?.bookable)
    if (step===1) return !checkingVisits && !!form.doctor && !matchingActiveDoctor(form.doctor)
    if (step===2) return !loadingSlots && !slotsError && !!form.date && !!form.time && timeSlots.includes(form.time)
    if (step===3) return !!form.reason && (form.reason !== 'Other' || form.reasonDetails.trim().length >= 2) && policyAccepted && !submitting && Boolean(bookingReadiness?.[form.clinicType]?.bookable)
    return false
  }

  const handleNext = () => {
    if (!canNext()) return
    if (step < 3) setStep(s => s+1)
    else void handleConfirm()
  }

  useEffect(() => {
    if (lastFocusedStep.current !== step) {
      lastFocusedStep.current = step
      bookingContentRef.current?.focus()
    }
  }, [step])

  const handleConfirm = async () => {
    if (bookingSubmissionLock.current || submitting || promotionsLoading || (promotionsError && form.service?.current_offer) || !policyAccepted || !form.reason || !form.date || !form.time || !timeSlots.includes(form.time) || !form.doctor || !form.service || !bookingReadiness?.[form.clinicType]?.bookable || readinessError) return
    const effective = eligibleBookingPromotions(bookablePromotions,{branchId,serviceId:form.service.id,date:form.date})
      .filter(p=>p.starts_on<=getLocalDateOnly() && p.ends_on>=getLocalDateOnly())
    if(selectedPromotionId && !effective.some(p=>Number(p.id)===Number(selectedPromotionId))){
      setBookingNotice('The selected offer is no longer available on this appointment date. Please review your service and date.');setSelectedPromotionId(null);return
    }
    bookingSubmissionLock.current = true
    setSubmitting(true)
    try {
      await bookAppointment({
        branch_id:       Number(branchId),
        doctor_id:        form.doctor.id,
        clinic_type:      form.clinicType,
        requested_service_id: form.service.id,
        promotion_id: selectedPromotionId || undefined,
        follow_up_id: /^[1-9]\d*$/.test(searchParams.get('follow_up_id') || '') ? Number(searchParams.get('follow_up_id')) : undefined,
        reason:           form.reason,
        reason_details:   form.reason === 'Other' ? form.reasonDetails.trim() : '',
        appointment_date: form.date,
        appointment_time: form.time,
        notes:            form.notes || '',
      })
      setDone(true)
      setActiveVisits((current) => [...current, { doctor_id: form.doctor.id, status: 'pending' }])
    } catch (err) {
      setBookingNotice(err.message || 'This appointment could not be booked. Please review your selection.')
      if (/already have an active appointment/i.test(err.message || '')) setStep(1)
    } finally {
      bookingSubmissionLock.current = false
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setStep(0); setServiceCategory('all'); setDone(false)
    setTimeSlots([]); setDoctorSchedules([])
    setPolicyAccepted(false)
    setSelectedPromotionId(null)
    setSubmitting(false)
    bookingSubmissionLock.current = false
    setForm({ clinicType:'', service:null, doctor:null, date:null, time:'', reason:'', reasonDetails:'', notes:'' })
  }

  const emailVerificationNotice = emailStatus === 'verified' ? null : emailStatus === 'checking' ? (
    <div role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Checking email verification status. You can continue booking while we check.
    </div>
  ) : emailStatus === 'error' ? (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Email verification status unavailable</p>
      <p className="mt-1">{emailStatusError} You can still book an appointment, but some email notifications may not reach you. We recommend verifying your email in Settings.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={refreshEmailVerification} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 font-bold text-amber-900 hover:bg-amber-100"><MdRefresh /> Retry status check</button>
        <NavLink to="/patient/settings" className="inline-flex min-h-10 items-center rounded-xl bg-amber-700 px-4 py-2 font-bold text-white hover:bg-amber-800">Verify Email in Settings</NavLink>
      </div>
    </div>
  ) : (
    <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-bold">Your email address is not verified</p>
      <p className="mt-1">You can still book an appointment. However, some appointment notifications and updates may be sent by email, so you might miss important messages. We recommend verifying your email address in Settings.</p>
      <NavLink to="/patient/settings" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-amber-700 px-4 py-2 font-bold text-white hover:bg-amber-800">Go to Settings · Verify Email</NavLink>
    </div>
  )

  if(!branchId)return <div className="max-w-2xl mx-auto space-y-4">{emailVerificationNotice}<h1 className="text-2xl font-bold text-slate-800">Choose a Clinic Branch</h1><p className="text-sm text-slate-500">Choose where you would like your appointment. Doctors, services, pricing and availability are specific to each branch.</p>{branches.map(b=><button type="button" key={b.id} className="w-full rounded-2xl border-2 bg-white p-5 text-left shadow-sm hover:border-emerald-500" onClick={()=>{selectBranch(String(b.id));setSelectedPromotionId(null);setForm({clinicType:'',service:null,doctor:null,date:null,time:'',reason:'',reasonDetails:'',notes:''});setStep(0)}}><b className="block text-slate-900">{b.name}</b><span className="text-sm text-slate-500">{b.address||'Address available from the clinic'}</span></button>)}{branchError&&<p className="text-red-600">{branchError}</p>}{!branches.length&&!branchError&&<p className="text-sm text-slate-500">Loading branches…</p>}</div>

  const branchName = branches.find(b=>String(b.id)===String(branchId))?.name || 'Selected Clinic Branch'
  const effectivePromotions = eligibleBookingPromotions(bookablePromotions,{branchId,serviceId:form.service?.id,date:form.date || getLocalDateOnly()})
    .filter(p=>p.starts_on<=getLocalDateOnly() && p.ends_on>=getLocalDateOnly())
  const selectedPromotion = effectivePromotions.find(p=>Number(p.id)===Number(selectedPromotionId)) || null
  const hasCurrentServiceOffer = bookablePromotions.some(p=>Number(p.branch_id)===Number(branchId) && Number(p.is_active ?? 1)!==0 && p.starts_on<=getLocalDateOnly() && p.ends_on>=getLocalDateOnly() && p.service_ids?.some(id=>Number(id)===Number(form.service?.id)) && ['percentage','fixed'].includes(p.discount_type))
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-1 pb-8 sm:px-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdCalendarToday className="text-emerald-700" /> Book an Appointment</h1>
          <p className="mt-1 text-sm text-slate-600">Clinic branch: <strong>{branchName}</strong></p>
        </div>
        <button type="button" className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" onClick={()=>{selectBranch('');setStep(0)}}>Change Branch</button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p><span className="font-semibold">Before you book:</span> Arrive 10 minutes early and cancel or reschedule if you cannot attend. The clinic confirms each request.</p>
        <a href={buildBookingPolicyUrl({ branchId, clinicType: form.clinicType, serviceId: form.service?.id, doctorId: form.doctor?.id })} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center gap-1 font-bold text-amber-900 underline underline-offset-2 hover:text-amber-700">
          Read full policy <MdArrowForward />
        </a>
      </div>
      {emailVerificationNotice}
      {promotionsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <span>{promotionsError}</span>
        <button type="button" onClick={()=>void loadPromotions()} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 font-bold text-amber-900">Retry Offers</button>
      </div>}
      {activeVisits.length > 0 && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="status">
        <p className="font-bold">You have {activeVisits.length} active appointment{activeVisits.length===1?'':'s'}.</p>
        <p className="mt-1">You cannot request another appointment with the same doctor until your earlier booking is completed or cancelled.</p>
        <NavLink className="mt-2 inline-block font-bold underline" to="/patient/appointments">View My Appointments</NavLink>
      </div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.85fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-6 lg:p-7">
            {!done && <StepBar current={step} />}
            {done ? <SuccessScreen onReset={handleReset} form={form} branchName={branchName} selectedPromotion={selectedPromotion} /> : <>
              <div ref={bookingContentRef} tabIndex={-1} className="outline-none" aria-label={STEPS[step]}>
                {step===0 && <StepService category={serviceCategory} onCategoryChange={selectCategory} value={form.service} onChange={selectService}
                  services={services} promotions={bookablePromotions} promotionsLoading={promotionsLoading} branchId={branchId} readiness={bookingReadiness} readinessLoading={loadingReadiness} readinessError={readinessError}
                  loading={loadingServices} error={serviceError} onRetry={loadServices} onRetryReadiness={loadBookingReadiness} />}
                {step===1 && <StepDoctor clinicType={form.clinicType} service={form.service} promotion={selectedPromotion} value={form.doctor} onChange={selectDoctorSafely} doctorList={doctorList} loadingDoctors={loadingDoctors} doctorError={doctorError} onRetry={loadDoctors} />}
                {step===2 && <StepSchedule date={form.date} time={form.time} service={form.service} promotion={selectedPromotion} hasCurrentServiceOffer={hasCurrentServiceOffer} onDateChange={set('date')} onTimeChange={set('time')} timeSlots={timeSlots} doctorSchedules={doctorSchedules} unavailableDates={doctorUnavailableDates} loadingSlots={loadingSlots} slotsError={slotsError} />}
                {step===3 && <StepReview form={{...form,branchId}} branchName={branchName} promotions={bookablePromotions} selectedPromotionId={selectedPromotionId} onPromotionChange={setSelectedPromotionId}
                  reasonOptions={reasonOptions} loadingReasons={loadingReasons} onReasonChange={(nextReason)=>setForm(current=>({...current,reason:nextReason,reasonDetails:nextReason==='Other'?current.reasonDetails:''}))}
                  onReasonDetailsChange={set('reasonDetails')} onNotesChange={set('notes')} policyAccepted={policyAccepted} onPolicyAcceptedChange={setPolicyAccepted} />}
              </div>
              {step > 0 && step < 3 && <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:hidden">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">View your selections</summary>
                <div className="mt-3"><BookingSummary form={form} branchName={branchName} selectedPromotion={selectedPromotion} /></div>
              </details>}
              <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button type="button" onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30">
                  <MdChevronLeft /> Back
                </button>
                <button type="button" onClick={handleNext} disabled={!canNext()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">
                  {step===3 ? submitting ? 'Submitting…' : 'Request Appointment' : 'Continue'}
                  {step<3 && <MdArrowForward aria-hidden="true" />}
                </button>
              </div>
            </>}
          </div>
        </section>
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20 lg:block" aria-label="Appointment summary">
          <BookingSummary form={form} branchName={branchName} selectedPromotion={selectedPromotion} />
        </aside>
      </div>
      {bookingNotice && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onClick={()=>setBookingNotice('')}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="booking-warning-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(event)=>event.stopPropagation()}>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100"><MdWarning className="text-2xl text-amber-700" /></div>
          <h2 id="booking-warning-title" className="text-lg font-black text-slate-900">Please review your appointment</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{bookingNotice}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2"><NavLink to="/patient/appointments" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">My Appointments</NavLink><button type="button" autoFocus className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white" onClick={()=>setBookingNotice('')}>Choose another option</button></div>
        </section>
      </div>}
    </div>
  )
}

export default BookAppointment










