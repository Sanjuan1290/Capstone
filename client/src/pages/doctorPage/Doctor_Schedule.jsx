import { useEffect, useState } from 'react'
import {
  deleteMyUnavailableDate,
  getMyScheduleAll,
  getMyUnavailableDates,
  saveMyScheduleDay,
  saveMyUnavailableDate,
} from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdInfo, MdSchedule, MdEventBusy,
} from 'react-icons/md'
import { formatDateOnly, getLocalDateOnly } from '../../utils/date'
import ScheduleDayCard from '../../components/schedule/ScheduleDayCard'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


const UnavailableDatesPanel = ({ dates, onSaved }) => {
  const [form, setForm] = useState({ unavailable_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [removingDate, setRemovingDate] = useState('')

  const handleSave = async () => {
    if (!form.unavailable_date) return
    setSaving(true)
    try {
      await saveMyUnavailableDate(form)
      setForm({ unavailable_date: '', reason: '' })
      onSaved()
    } catch (err) {
      alert(err.message || 'Failed to save unavailable date.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (date) => {
    setRemovingDate(date)
    try {
      await deleteMyUnavailableDate(date)
      onSaved()
    } catch (err) {
      alert(err.message || 'Failed to remove unavailable date.')
    } finally {
      setRemovingDate('')
    }
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
          <MdEventBusy className="text-[18px] text-rose-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-800">Specific Date Unavailable</h2>
          <p className="mt-1 text-xs text-slate-500">Use this when you are available on that weekday in general, but need one exact date blocked off.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.2fr_auto]">
        <input
          type="date"
          min={getLocalDateOnly()}
          value={form.unavailable_date}
          onChange={(e) => setForm((current) => ({ ...current, unavailable_date: e.target.value }))}
          className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-rose-300"
        />
        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
          placeholder="Reason (optional)"
          className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-rose-300"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!form.unavailable_date || saving}
          className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Block Date'}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {dates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
            No specific blocked dates yet.
          </p>
        ) : dates.map((item) => (
          <div key={item.unavailable_date} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{formatDateOnly(item.unavailable_date)}</p>
              <p className="text-[11px] text-slate-400">{item.unavailable_date}</p>
              <p className="text-xs text-slate-500">{item.reason || 'No reason added.'}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(item.unavailable_date)}
              disabled={removingDate === item.unavailable_date}
              className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {removingDate === item.unavailable_date ? 'Removing...' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const Doctor_Schedule = () => {
  const [schedules, setSchedules] = useState([])
  const [unavailableDates, setUnavailableDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)

  const loadScheduleData = async () => {
    setSchedLoading(true)
    try {
      const [scheduleRows, unavailableRows] = await Promise.all([
        getMyScheduleAll(),
        getMyUnavailableDates(),
      ])
      setSchedules(Array.isArray(scheduleRows) ? scheduleRows : [])
      setUnavailableDates(Array.isArray(unavailableRows) ? unavailableRows : [])
    } catch (err) {
      console.error('Schedule load error:', err)
      setSchedules([])
      setUnavailableDates([])
    } finally {
      setLoading(false)
      setSchedLoading(false)
    }
  }

  useEffect(() => {
    loadScheduleData()
  }, [])

  const getForDay = (day) => schedules.find((schedule) => schedule.day_of_week === day)
  const activeDays = DAYS.filter((day) => getForDay(day)?.is_active)
  const inactiveDays = DAYS.filter((day) => !getForDay(day)?.is_active)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" />
        <p className="text-sm font-medium text-slate-400">Loading your schedule...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 lg:text-2xl">
            <MdSchedule className="text-[22px] text-violet-500" /> My Schedule
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">
            Set your weekly availability and block specific dates when needed.
          </p>
        </div>
        {schedLoading && (
          <div className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-violet-500" />
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
        <MdInfo className="mt-0.5 shrink-0 text-[18px] text-violet-500" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Your schedule controls when patients can book appointments.</p>
          <p className="mt-1 text-xs text-violet-600">
            Combine weekly schedule cards with exact blocked dates below for more flexibility. Weekly hours stay active, and a specific blocked date overrides them for that one day only.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
            <MdCalendarToday className="text-[18px] text-violet-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{activeDays.length}</p>
            <p className="text-xs font-medium text-slate-400">Active days</p>
          </div>
        </div>
        <div className="h-10 w-px bg-slate-100" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
            <MdAccessTime className="text-[18px] text-slate-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-400">{inactiveDays.length}</p>
            <p className="text-xs font-medium text-slate-400">Inactive</p>
          </div>
        </div>
        <div className="h-10 w-px bg-slate-100" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
            <MdEventBusy className="text-[18px] text-rose-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-rose-500">{unavailableDates.length}</p>
            <p className="text-xs font-medium text-slate-400">Blocked dates</p>
          </div>
        </div>
        {activeDays.length > 0 && (
          <>
            <div className="hidden h-10 w-px bg-slate-100 sm:block" />
            <p className="hidden flex-1 text-xs text-slate-500 sm:block">
              Active on: <span className="font-semibold text-slate-700">{activeDays.join(', ')}</span>
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DAYS.map((day) => (
          <ScheduleDayCard
            key={day}
            day={day}
            schedule={getForDay(day)}
            onSave={saveMyScheduleDay}
            onSaved={loadScheduleData}
          />
        ))}
      </div>

      <UnavailableDatesPanel
        dates={unavailableDates}
        onSaved={loadScheduleData}
      />
    </div>
  )
}

export default Doctor_Schedule


