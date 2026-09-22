import { useEffect, useMemo, useState } from 'react'
import { MdAccessTime, MdCalendarToday, MdEventAvailable, MdRefresh, MdSearch } from 'react-icons/md'
import { getDoctorAvailability, getDoctors, getDoctorSchedules } from '../../services/staff.service'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import { formatDateOnly, getLocalDateOnly } from '../../utils/date'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const fmt = (value) => {
  if (!value) return '—'
  const [h, m] = String(value).split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

const Staff_DoctorSchedules = () => {
  const [doctors, setDoctors] = useState([])
  const [selected, setSelected] = useState(null)
  const [rows, setRows] = useState([])
  const [availability, setAvailability] = useState(null)
  const [selectedDate, setSelectedDate] = useState(getLocalDateOnly())
  const [search, setSearch] = useState('')
  const [loadingDoctors, setLoadingDoctors] = useState(true)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoadingDoctors(true)
    getDoctors()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setDoctors(list)
        if (list[0]) setSelected(list[0])
      })
      .catch((err) => setError(err.message || 'Could not load doctors.'))
      .finally(() => setLoadingDoctors(false))
  }, [])

  const loadSelectedDoctor = async (doctor = selected) => {
    if (!doctor?.id) return
    setLoadingSchedule(true)
    setError('')
    try {
      const startDate = getLocalDateOnly()
      const [weekly, actual] = await Promise.all([
        getDoctorSchedules(doctor.id),
        getDoctorAvailability(doctor.id, { startDate, days: 14 }),
      ])
      setRows(Array.isArray(weekly) ? weekly : [])
      setAvailability(actual || null)
      const actualDays = actual?.doctor?.availability || []
      const nextSelected = actualDays.some((day) => day.date === selectedDate)
        ? selectedDate
        : (actualDays[0]?.date || startDate)
      setSelectedDate(nextSelected)
    } catch (err) {
      setError(err.message || 'Could not load doctor availability.')
    } finally {
      setLoadingSchedule(false)
    }
  }

  useEffect(() => { loadSelectedDoctor(selected) }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => doctors.filter((doctor) => (
    `${doctor.full_name} ${doctor.specialty || ''}`.toLowerCase().includes(search.toLowerCase())
  )), [doctors, search])

  const scheduleFor = (day) => rows.find((row) => row.day_of_week === day)
  const calendarDays = availability?.doctor?.availability || []
  const selectedDay = calendarDays.find((day) => day.date === selectedDate) || calendarDays[0] || null
  const availableSlots = selectedDay?.slots?.filter((slot) => slot.available) || []

  if (loadingDoctors) return <div className="mx-auto w-full max-w-6xl"><LoadingState label="Loading doctors..." /></div>

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdCalendarToday className="text-sky-500" /> Doctor Schedules</h1>
          <p className="mt-1 text-sm text-slate-500">Read-only doctor availability for appointment coordination and walk-ins. Choose a date to see the actual appointment slots.</p>
        </div>
        <button className="button-secondary" onClick={() => loadSelectedDoctor()} disabled={!selected || loadingSchedule}><MdRefresh /> Refresh</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-control pl-10" placeholder="Search doctor or specialty..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-3 max-h-[640px] space-y-2 overflow-y-auto">
            {filtered.map((doctor) => (
              <button key={doctor.id} onClick={() => setSelected(doctor)} className={`w-full rounded-2xl border p-3 text-left ${selected?.id === doctor.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="font-bold text-slate-800">{doctor.full_name}</p>
                <p className="mt-1 text-xs text-slate-500">{doctor.specialty || 'Doctor'}</p>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-5 text-center text-sm text-slate-400">No matching doctors.</p>}
          </div>
        </aside>

        <section className="space-y-5">
          {loadingSchedule ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><LoadingState label="Loading doctor schedule..." /></div>
            : error ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><ErrorState message={error} onRetry={() => loadSelectedDoctor()} /></div>
              : !selected ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><EmptyState title="Select a doctor" description="Choose a doctor to view weekly availability." /></div>
                : <>
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="border-b border-slate-100 pb-4">
                      <h2 className="text-lg font-black text-slate-900">{selected.full_name}</h2>
                      <p className="text-sm text-slate-500">{selected.specialty || 'Doctor'}</p>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {DAYS.map((day) => {
                        const row = scheduleFor(day)
                        const active = Boolean(row && Number(row.is_active) !== 0)
                        return (
                          <div key={day} className={`rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex items-center justify-between gap-2"><p className="font-bold text-slate-800">{day}</p><span className={`rounded-full px-2 py-1 text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{active ? 'Available' : 'Unavailable'}</span></div>
                            {active && <><p className="mt-3 text-sm font-semibold text-slate-700">{Number(row.is_24_hours) === 1 ? 'Available 24 hours' : `${fmt(row.start_time)} – ${fmt(row.end_time)}${Number(row.spans_next_day) === 1 ? ' · ends next day' : ''}`}</p><p className="mt-1 text-xs text-slate-500">{Number(row.slot_duration_mins || 60)}-minute slots</p></>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><MdEventAvailable className="text-sky-500" /> Date Availability</h2><p className="mt-1 text-sm text-slate-500">Select a date to see real slots after blocked dates, existing appointments, and passed times are applied.</p></div>
                    </div>
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                      {calendarDays.map((day) => {
                        const date = new Date(`${day.date}T12:00:00`)
                        const count = (day.slots || []).filter((slot) => slot.available).length
                        const active = day.date === selectedDate
                        return (
                          <button key={day.date} onClick={() => setSelectedDate(day.date)} className={`min-w-[118px] rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <p className={`text-xs font-black uppercase ${active ? 'text-sky-700' : 'text-slate-400'}`}>{date.toLocaleDateString('en-PH', { weekday: 'short' })}</p>
                            <p className="mt-1 font-black text-slate-900">{date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</p>
                            <p className={`mt-2 text-[11px] font-bold ${day.unavailable_reason ? 'text-rose-600' : count ? 'text-emerald-600' : 'text-slate-400'}`}>{day.unavailable_reason ? 'Blocked' : `${count} open slot${count === 1 ? '' : 's'}`}</p>
                          </button>
                        )
                      })}
                    </div>

                    {selectedDay && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-slate-900">{formatDateOnly(selectedDay.date, 'en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><p className="mt-1 text-xs text-slate-500">{availableSlots.length} available appointment slot{availableSlots.length === 1 ? '' : 's'}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500"><MdAccessTime className="mr-1 inline" /> Actual slots</span></div>
                      {selectedDay.unavailable_reason ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">Unavailable: {selectedDay.unavailable_reason}</div>
                        : !selectedDay.slots?.length ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No schedule is configured for this date.</div>
                          : <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{selectedDay.slots.map((slot) => <div key={slot.time} className={`rounded-xl border px-3 py-3 text-center text-sm font-bold ${slot.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : slot.state === 'booked' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-400'}`}><p>{slot.time}</p><p className="mt-1 text-[10px] uppercase tracking-wide">{slot.available ? 'Available' : slot.state === 'booked' ? 'Booked' : 'Passed'}</p></div>)}</div>}
                    </div>}
                  </div>
                </>}
        </section>
      </div>
    </div>
  )
}

export default Staff_DoctorSchedules
