import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MdCalendarToday, MdEventBusy, MdRefresh } from 'react-icons/md'
import { getDoctorsAvailability } from '../../services/patient.service'
import { getLocalDateOnly } from '../../utils/date'

const fmtDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtTime = (value) => {
  if (!value) return ''
  if (/\b(?:AM|PM)\b/i.test(String(value))) return String(value)
  const [hour, minute] = String(value).split(':').map(Number)
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute || 0).padStart(2, '0')} ${period}`
}

const DoctorAvailability = () => {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDoctorsAvailability({ startDate: getLocalDateOnly(), days: 7 })
      setDoctors(Array.isArray(data?.doctors) ? data.doctors : [])
    } catch (err) {
      setDoctors([])
      setError(err.message || 'Unable to load doctor availability.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading doctor availability...</div>
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Doctor Availability</h1>
        <p className="mt-1 text-sm text-slate-500">View doctor schedules, booked slots, and the next available appointment before booking.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
          {error}
          <button onClick={load} className="ml-3 font-bold"><MdRefresh className="inline" /> Try again</button>
        </div>
      )}

      {!error && doctors.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <MdEventBusy className="mx-auto text-3xl text-slate-300" />
          <h2 className="mt-3 font-bold text-slate-800">No doctors are available for online booking</h2>
          <p className="mt-1 text-sm text-slate-500">Please check again later or contact the clinic.</p>
        </div>
      )}

      {doctors.map((doctor) => {
        const active = Array.isArray(doctor.weekly_schedule) ? doctor.weekly_schedule : []
        const isOpen = expanded === doctor.id
        const clinicType = String(doctor.specialty || '').toLowerCase().includes('derm') ? 'derma' : 'medical'
        return (
          <div key={doctor.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 font-black text-emerald-700">
                {String(doctor.full_name || 'DR').replace(/^Dr\.?\s*/i, '').split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-slate-900">{doctor.full_name}</h2>
                <p className="text-sm text-slate-500">{doctor.specialty || 'Clinic Doctor'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {active.length > 0 ? active.map((schedule) => (
                    <span key={schedule.day_of_week} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {schedule.day_of_week.slice(0, 3)} {fmtTime(schedule.start_time)}–{fmtTime(schedule.end_time)}
                    </span>
                  )) : <span className="text-xs font-semibold text-amber-600">No active online schedule</span>}
                </div>
                {doctor.next_available ? (
                  <p className="mt-2 text-xs font-bold text-emerald-700">Next available: {fmtDate(doctor.next_available.date)} · {doctor.next_available.time}</p>
                ) : active.length > 0 ? (
                  <p className="mt-2 text-xs font-semibold text-amber-600">No open slots in the next 7 days.</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button disabled={!active.length} onClick={() => setExpanded(isOpen ? null : doctor.id)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40">
                  {isOpen ? 'Hide Slots' : 'View Slots'}
                </button>
                <NavLink to={`/patient/book?doctor=${doctor.id}&clinic=${clinicType}`} className={`rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white ${!active.length ? 'pointer-events-none opacity-40' : ''}`}>Book</NavLink>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 bg-slate-50 p-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  {(doctor.availability || []).map((day) => (
                    <div key={day.date} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><MdCalendarToday className="text-emerald-500" />{fmtDate(day.date)}</p>
                      {day.slots.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-400">{day.unavailable_reason || 'Doctor unavailable / no schedule.'}</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {day.slots.map((slot) => (
                            <span key={slot.time} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${slot.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
                              {slot.time} · {slot.available ? 'Available' : 'Booked'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default DoctorAvailability
