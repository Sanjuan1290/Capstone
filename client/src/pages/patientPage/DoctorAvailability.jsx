import { usePatientBranch } from '../../context/PatientBranchContext'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { buildSlotBookingPath } from '../../utils/bookingHandoff.mjs'
import { MdCalendarToday, MdChevronLeft, MdChevronRight, MdEventBusy, MdRefresh } from 'react-icons/md'
import { getDoctorsAvailability } from '../../services/patient.service'
import { getLocalDateOnly } from '../../utils/date'
import { scheduleSummary } from '../../utils/schedule'
import { doctorClinicLabel } from '../../utils/doctor'
import {
  availableSlotsForDay, calendarDayState, monthAvailabilityRequests,
  monthDateList, monthKeyFromDate, monthSundayOffset, shiftMonth, unavailableDayReason,
} from '../../utils/doctorAvailabilityCalendar.mjs'

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const sortWeeklySchedule = (items = []) => [...items].sort((a, b) => WEEKDAY_ORDER.indexOf(a.day_of_week) - WEEKDAY_ORDER.indexOf(b.day_of_week))
const fmtDate = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const monthTitle = (monthKey) => new Date(`${monthKey}-01T12:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayClass = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
  blocked: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100',
  unavailable: 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200',
  past: 'border-slate-100 bg-slate-50 text-slate-400',
  unknown: 'border-slate-200 bg-white text-slate-500',
}

const DoctorAvailability = () => {
  const [doctors, setDoctors] = useState([])
  const { branches, branchId, selectBranch } = usePatientBranch()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [clinicFilter, setClinicFilter] = useState('all')
  const [monthKey, setMonthKey] = useState(() => monthKeyFromDate(getLocalDateOnly()))
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateOnly())
  const [monthDays, setMonthDays] = useState(null)
  const [monthLoading, setMonthLoading] = useState(false)
  const [monthError, setMonthError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    setError('')
    try {
      const data = await getDoctorsAvailability({ startDate: getLocalDateOnly(), days: 7, branchId })
      setDoctors(Array.isArray(data?.doctors) ? data.doctors : [])
    } catch (err) {
      setDoctors([])
      setError(err.message || 'Unable to load doctor availability.')
    } finally {
      setLoading(false)
    }
  }, [branchId])
  const refresh = useCallback(async () => {
    setRefreshVersion(previous => previous + 1)
    await load()
  }, [load])
  useEffect(() => { if (branchId) void load() }, [branchId, load])
  useEffect(() => {
    setExpanded(null)
    setMonthDays(null)
    setMonthKey(monthKeyFromDate(getLocalDateOnly()))
    setSelectedDate(getLocalDateOnly())
  }, [branchId])
  useClinicRefresh(() => { if (branchId) return refresh() }, ['schedule.updated', 'appointment.updated', 'service.updated'], { fallbackMs: 60000 })

  // The API caps the days parameter at 14. Load one calendar month using 2–3
  // independent 14-day reads, with stale-response protection on navigation.
  useEffect(() => {
    if (!branchId || expanded === null) return undefined
    let current = true
    setMonthLoading(true)
    setMonthError('')
    setMonthDays(null)
    const chunks = monthAvailabilityRequests(monthKey)
    Promise.all(chunks.map(({ startDate, days }) => getDoctorsAvailability({ branchId, startDate, days })))
      .then(results => {
        if (!current) return
        const daysByDate = {}
        results.forEach(result => {
          const doctor = result.doctors?.find(item => String(item.id) === String(expanded))
          for (const day of doctor?.availability || []) daysByDate[day.date] = day
        })
        setMonthDays(daysByDate)
      })
      .catch(err => {
        if (!current) return
        setMonthError(err.message || 'Unable to load calendar dates.')
      })
      .finally(() => { if (current) setMonthLoading(false) })
    return () => { current = false }
  }, [branchId, expanded, monthKey, refreshVersion])

  const toggleCalendar = (doctorId) => {
    if (expanded === doctorId) { setExpanded(null); return }
    const today = getLocalDateOnly()
    setExpanded(doctorId)
    setMonthKey(monthKeyFromDate(today))
    setSelectedDate(today)
  }
  const changeMonth = (delta) => {
    const next = shiftMonth(monthKey, delta)
    if (delta < 0 && next < monthKeyFromDate(getLocalDateOnly())) return
    setMonthKey(next)
    setSelectedDate(next === monthKeyFromDate(getLocalDateOnly()) ? getLocalDateOnly() : `${next}-01`)
  }
  const today = getLocalDateOnly()

  if (!branchId) return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 text-center">
      <h1 className="text-2xl font-black text-slate-900">Choose a Branch</h1>
      <p className="text-sm text-slate-500">Select a clinic location to view its doctors and schedules.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map((branch) => <button type="button" className="rounded-2xl border border-slate-200 bg-white p-5 text-center hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500" key={branch.id} onClick={() => { selectBranch(String(branch.id)); setExpanded(null) }}>
          <span className="block font-bold text-slate-900">{branch.name}</span>
          {branch.address && <span className="mt-1 block text-sm text-slate-500">{branch.address}</span>}
        </button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  )

  if (loading) return <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500" role="status">Loading doctor availability...</div>

  const filteredDoctors = doctors.filter((doctor) => clinicFilter === 'all' || doctor.clinic_type === clinicFilter)
  const branchName = branches.find((branch) => String(branch.id) === String(branchId))?.name || 'this branch'
  const monthDates = monthDateList(monthKey)
  const selectedDay = monthDays?.[selectedDate]
  const selectedState = calendarDayState(selectedDate, selectedDay, today)
  const available = selectedState === 'available' ? availableSlotsForDay(selectedDay) : []

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-3 pb-8 sm:px-4">
      <header className="mx-auto max-w-3xl space-y-2 text-center">
        <h1 className="text-2xl font-black text-slate-900">Doctor Availability</h1>
        <p className="text-sm leading-relaxed text-slate-600">Choose a doctor and date at {branchName}. Only available times are shown. Final availability is checked after you choose a service.</p>
        <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-bold text-emerald-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" onClick={() => { selectBranch(''); setDoctors([]); setExpanded(null) }}>Change Branch</button>
      </header>

      {error && <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
        {error} <button type="button" onClick={refresh} className="ml-3 inline-flex items-center gap-1 font-bold underline"><MdRefresh /> Try again</button>
      </div>}

      {!error && doctors.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <MdEventBusy className="mx-auto text-3xl text-slate-300" />
        <h2 className="mt-3 font-bold text-slate-800">No doctors are available for online booking</h2>
        <p className="mt-1 text-sm text-slate-500">Please check again later or contact the clinic.</p>
      </div>}

      {doctors.length > 0 && <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3" role="group" aria-label="Filter doctors by clinic type">
        {[['all', 'All Doctors'], ['medical', 'General Medicine'], ['derma', 'Dermatology']].map(([value, label]) => <button key={value} type="button" aria-pressed={clinicFilter === value} onClick={() => setClinicFilter(value)} className={`min-h-10 rounded-xl px-4 py-2 text-center text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${clinicFilter === value ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>)}
      </div>}

      {!error && doctors.length > 0 && filteredDoctors.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No doctors match this department.</p>}

      <div className="grid gap-5">
        {filteredDoctors.map((doctor) => {
          const active = sortWeeklySchedule(Array.isArray(doctor.weekly_schedule) ? doctor.weekly_schedule : [])
          const isOpen = expanded === doctor.id
          const clinicType = doctor.clinic_type
          const panelId = `doctor-calendar-${doctor.id}`
          return <section key={doctor.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-label={`${doctor.full_name} availability`}>
            <div className="flex flex-col items-center gap-3 px-4 py-5 text-center sm:px-6 sm:py-6">
              <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 font-black text-emerald-700">
                {String(doctor.full_name || 'DR').replace(/^Dr\.?\s*/i, '').split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="break-words text-lg font-black text-slate-900">{doctor.full_name}</h2>
                <p className="text-sm text-slate-500">{doctorClinicLabel(doctor)}</p>
              </div>
              <div className="flex max-w-4xl flex-wrap items-center justify-center gap-2">
                {active.length > 0 ? active.map(schedule => <span key={schedule.day_of_week} className="rounded-full bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600">
                  {schedule.day_of_week.slice(0, 3)} · {scheduleSummary(schedule)}
                </span>) : <span className="text-xs font-semibold text-amber-700">No active online schedule</span>}
              </div>
              {doctor.next_available ? <p className="text-center text-xs font-bold leading-relaxed text-emerald-700">Next available: {fmtDate(doctor.next_available.date)} · {doctor.next_available.time}</p> : active.length > 0 ? <p className="text-xs font-semibold text-amber-700">No available times in the next 7 days.</p> : null}
              <div className="flex w-full flex-wrap items-center justify-center gap-2 pt-1 sm:w-auto">
                <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleCalendar(doctor.id)} className="inline-flex min-h-11 min-w-[135px] flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:flex-none">
                  {isOpen ? 'Hide Calendar' : 'View Calendar'}
                </button>
                {active.length ? <NavLink to={buildSlotBookingPath({ branchId, doctorId: doctor.id, clinicType })} className="inline-flex min-h-11 min-w-[135px] flex-1 items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:flex-none">Book Appointment</NavLink> : <span aria-disabled="true" className="inline-flex min-h-11 min-w-[135px] items-center justify-center rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-400">Booking Unavailable</span>}
              </div>
            </div>

            {isOpen && <div id={panelId} className="border-t border-slate-200 bg-slate-50 px-3 py-5 sm:p-5">
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(270px,1fr)]">
                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-5" aria-label={`Calendar for ${doctor.full_name}`}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <button type="button" aria-label="Previous month" disabled={monthKey <= monthKeyFromDate(today)} onClick={() => changeMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><MdChevronLeft /></button>
                    <h3 aria-live="polite" className="text-center text-base font-black text-slate-900 sm:text-lg">{monthTitle(monthKey)}</h3>
                    <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"><MdChevronRight /></button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
                    {CALENDAR_DAYS.map(day => <div key={day} className="pb-2 text-[11px] font-bold text-slate-500 sm:text-xs">{day}</div>)}
                    {Array.from({ length: monthSundayOffset(monthKey) }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
                    {monthDates.map(date => {
                      const day = monthDays?.[date]
                      const state = monthLoading ? 'unknown' : calendarDayState(date, day, today)
                      const isSelected = date === selectedDate
                      const count = day ? availableSlotsForDay(day).length : 0
                      return <button key={date} type="button" aria-label={`${fmtDate(date)}: ${state === 'available' ? `${count} available times` : state === 'blocked' ? 'Unavailable, clinic closure' : state === 'past' ? 'Past date' : state === 'unknown' ? 'Not loaded' : 'Unavailable'}`} aria-pressed={isSelected} onClick={() => setSelectedDate(date)} className={`flex min-h-[54px] min-w-0 flex-col items-center justify-center rounded-xl border p-1 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:min-h-[64px] ${dayClass[state]} ${isSelected ? 'ring-2 ring-emerald-700 ring-offset-1' : ''}`}>
                        <span className="text-sm font-bold">{Number(date.slice(-2))}</span>
                        {state === 'available' && <span className="text-[9px] font-semibold sm:text-[10px]">{count} open</span>}
                        {state === 'blocked' && <span className="text-[9px] font-bold sm:text-[10px]">Closed</span>}
                      </button>
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-600" aria-label="Calendar date statuses">
                    <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Available</span>
                    <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />Blocked</span>
                    <span><span aria-hidden="true" className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />Unavailable</span>
                  </div>
                </section>

                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-live="polite" aria-label="Selected date availability">
                  <div className="flex items-center justify-center gap-2 text-center"><MdCalendarToday className="text-emerald-700" /><h3 className="text-base font-black text-slate-900">{fmtDate(selectedDate)}</h3></div>
                  {monthLoading ? <p role="status" className="mt-6 text-center text-sm text-slate-500">Loading available times…</p>
                    : monthError ? <div role="alert" className="mt-5 space-y-3 text-center"><p className="text-sm text-rose-700">{monthError}</p><button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 font-bold text-slate-700" onClick={() => setRefreshVersion(version => version + 1)}><MdRefresh /> Try again</button></div>
                      : available.length ? <>
                        <p className="mt-3 text-center text-sm text-slate-600">{available.length} available {available.length === 1 ? 'time' : 'times'}. Choose one to start booking.</p>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                          {available.map(slot => <NavLink key={slot.time} to={buildSlotBookingPath({ branchId, doctorId: doctor.id, clinicType, date: selectedDate, time: slot.time })} aria-label={`Book ${fmtDate(selectedDate)} at ${slot.time} with ${doctor.full_name}`} className="flex min-h-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-2 py-2 text-center text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">{slot.time}</NavLink>)}
                        </div>
                        <p className="mt-4 text-center text-xs text-slate-500">Appointment times depend on the service selected and the clinic's booking policy.</p>
                      </> : <div className="mt-6 rounded-xl bg-slate-50 p-5 text-center">
                        <MdEventBusy className="mx-auto text-2xl text-slate-400" aria-hidden="true" />
                        <p className="mt-2 font-bold text-slate-800">Unavailable</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{unavailableDayReason(selectedDate, selectedDay, today)}</p>
                      </div>}
                </section>
              </div>
            </div>}
          </section>
        })}
      </div>
    </main>
  )
}

export default DoctorAvailability
