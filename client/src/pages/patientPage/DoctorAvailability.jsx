import { usePatientBranch } from '../../context/PatientBranchContext'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { buildSlotBookingPath } from '../../utils/bookingHandoff.mjs'
import { MdCalendarToday, MdEventBusy, MdRefresh } from 'react-icons/md'
import { getDoctorsAvailability } from '../../services/patient.service'
import { getLocalDateOnly } from '../../utils/date'
import { scheduleSummary } from '../../utils/schedule'
import { doctorClinicLabel } from '../../utils/doctor'
import { dayAvailabilityCounts, slotDisplayLabel, slotDisplayState } from '../../utils/doctorAvailabilityPresentation.mjs'

const WEEKDAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const sortWeeklySchedule = (items = []) => [...items].sort((a, b) => WEEKDAY_ORDER.indexOf(a.day_of_week) - WEEKDAY_ORDER.indexOf(b.day_of_week))
const fmtDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const statusStyles = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-100 focus-visible:outline-emerald-600',
  booked: 'border-amber-200 bg-amber-50 text-amber-800',
  unavailable: 'border-slate-200 bg-slate-100 text-slate-500',
}
const legend = [
  { key: 'available', label: 'Available', color: 'bg-emerald-500' },
  { key: 'booked', label: 'Booked', color: 'bg-amber-500' },
  { key: 'unavailable', label: 'Unavailable', color: 'bg-slate-400' },
]

const DoctorAvailability = () => {
  const [doctors, setDoctors] = useState([])
  const { branches, branchId, selectBranch } = usePatientBranch()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [clinicFilter, setClinicFilter] = useState('all')

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

  useEffect(() => { if (branchId) void load() }, [branchId, load])
  useClinicRefresh(() => { if (branchId) return load() }, ['schedule.updated', 'appointment.updated', 'service.updated'], { fallbackMs: 60000 })

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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-3 pb-8 sm:px-4">
      <header className="mx-auto max-w-3xl space-y-2 text-center">
        <h1 className="text-2xl font-black text-slate-900">Doctor Availability</h1>
        <p className="text-sm leading-relaxed text-slate-600">View doctors and time slots at {branchName}. Select an available time to start booking. Final availability is checked when you choose your service.</p>
        <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-bold text-emerald-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" onClick={() => { selectBranch(''); setDoctors([]); setExpanded(null) }}>Change Branch</button>
      </header>

      {error && (
        <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
          {error}
          <button type="button" onClick={load} className="ml-3 inline-flex items-center gap-1 font-bold underline"><MdRefresh /> Try again</button>
        </div>
      )}

      {!error && doctors.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <MdEventBusy className="mx-auto text-3xl text-slate-300" />
          <h2 className="mt-3 font-bold text-slate-800">No doctors are available for online booking</h2>
          <p className="mt-1 text-sm text-slate-500">Please check again later or contact the clinic.</p>
        </div>
      )}

      {doctors.length > 0 && <>
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3" role="group" aria-label="Filter doctors by clinic type">
          { [['all','All Doctors'],['medical','General Medicine'],['derma','Dermatology']].map(([value, label]) => <button key={value} type="button" aria-pressed={clinicFilter === value} onClick={() => setClinicFilter(value)} className={`min-h-10 rounded-xl px-4 py-2 text-center text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${clinicFilter === value ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>) }
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="Time slot statuses">
          {legend.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.color}`} />{item.label}</span>)}
        </div>
      </>}

      {!error && doctors.length > 0 && filteredDoctors.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No doctors match this department.</p>}

      <div className="grid gap-5">
        {filteredDoctors.map((doctor) => {
          const active = sortWeeklySchedule(Array.isArray(doctor.weekly_schedule) ? doctor.weekly_schedule : [])
          const isOpen = expanded === doctor.id
          const clinicType = doctor.clinic_type
          const panelId = `doctor-slots-${doctor.id}`
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
                {active.length > 0 ? active.map((schedule) => <span key={schedule.day_of_week} className="rounded-full bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-600">
                  {schedule.day_of_week.slice(0, 3)} · {scheduleSummary(schedule)}
                </span>) : <span className="text-xs font-semibold text-amber-700">No active online schedule</span>}
              </div>
              {doctor.next_available ? <p className="text-center text-xs font-bold leading-relaxed text-emerald-700">Next available: {fmtDate(doctor.next_available.date)} · {doctor.next_available.time}</p> : active.length > 0 ? <p className="text-xs font-semibold text-amber-700">No available times in the next 7 days.</p> : null}
              <div className="flex w-full flex-wrap items-center justify-center gap-2 pt-1 sm:w-auto">
                <button type="button" aria-expanded={isOpen} aria-controls={panelId} disabled={!active.length} onClick={() => setExpanded(isOpen ? null : doctor.id)} className="inline-flex min-h-11 min-w-[135px] flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:flex-none">
                  {isOpen ? 'Hide Slots' : 'View Slots'}
                </button>
                {active.length ? <NavLink to={buildSlotBookingPath({ branchId, doctorId: doctor.id, clinicType })} className="inline-flex min-h-11 min-w-[135px] flex-1 items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:flex-none">Book Appointment</NavLink> : <span aria-disabled="true" className="inline-flex min-h-11 min-w-[135px] items-center justify-center rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-400">Booking Unavailable</span>}
              </div>
            </div>

            {isOpen && <div id={panelId} className="border-t border-slate-200 bg-slate-50 px-3 py-5 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                {(doctor.availability || []).map((day) => {
                  const slots = Array.isArray(day.slots) ? day.slots : []
                  const counts = dayAvailabilityCounts(slots)
                  return <section key={day.date} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4" aria-label={`${fmtDate(day.date)} time slots`}>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                      <h3 className="inline-flex items-center justify-center gap-1.5 text-sm font-black text-slate-900"><MdCalendarToday className="text-emerald-600" aria-hidden="true" />{fmtDate(day.date)}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${counts.available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{counts.available} available</span>
                    </div>
                    {!slots.length ? <div className="mt-4 flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 px-4 py-5 text-center">
                      <span className="text-sm font-bold text-slate-700">Unavailable</span>
                      <span className="text-xs text-slate-500">{day.unavailable_reason || 'No scheduled appointment times for this date.'}</span>
                    </div> : <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                      {slots.map((slot) => {
                        const displayState = slotDisplayState(slot)
                        const label = slotDisplayLabel(slot)
                        const content = <><span className="font-bold">{slot.time}</span><span className="text-[11px] font-semibold">{label}</span></>
                        const common = `flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-xs leading-tight ${statusStyles[displayState]}`
                        return displayState === 'available' ? <NavLink key={slot.time} aria-label={`Book ${fmtDate(day.date)} at ${slot.time} with ${doctor.full_name}`} to={buildSlotBookingPath({ branchId, doctorId: doctor.id, clinicType, date: day.date, time: slot.time })} className={`${common} transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`}>{content}</NavLink> : <span key={slot.time} className={common} aria-label={`${slot.time} ${label.toLowerCase()}`}>{content}</span>
                      })}
                    </div>}
                  </section>
                })}
              </div>
            </div>}
          </section>
        })}
      </div>
    </main>
  )
}

export default DoctorAvailability
