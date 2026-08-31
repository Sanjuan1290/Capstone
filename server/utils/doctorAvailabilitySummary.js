const db = require('../db/connect')
const { parseTimeToMinutes } = require('./appointmentSecurity')
const { getTodayDateOnly, addDaysDateOnly, getZonedParts, CLINIC_TIMEZONE } = require('./date')

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const formatSlotLabel = (minutes) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${period}`
}

const clinicMatchesDoctor = (clinicType, specialty) => {
  if (!clinicType) return true
  const isDerma = String(specialty || '').toLowerCase().includes('derm')
  return clinicType === 'derma' ? isDerma : clinicType === 'medical' ? !isDerma : false
}

const buildDoctorAvailabilitySummary = async ({ clinicType = '', startDate, days = 7 } = {}, executor = db) => {
  const safeDays = Math.min(14, Math.max(1, Number(days) || 7))
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) ? String(startDate) : getTodayDateOnly()
  const end = addDaysDateOnly(start, safeDays - 1)

  const [doctorRows] = await executor.query(
    `SELECT id, full_name, specialty
     FROM doctors
     WHERE is_active = 1
     ORDER BY full_name`
  )
  const doctors = doctorRows.filter((doctor) => clinicMatchesDoctor(clinicType, doctor.specialty))
  if (!doctors.length) return { start_date: start, end_date: end, days: safeDays, doctors: [] }

  const doctorIds = doctors.map((doctor) => Number(doctor.id))
  const placeholders = doctorIds.map(() => '?').join(',')

  const [schedules] = await executor.query(
    `SELECT doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active
     FROM doctor_schedules
     WHERE doctor_id IN (${placeholders}) AND is_active = 1`,
    doctorIds
  )
  const [blocks] = await executor.query(
    `SELECT doctor_id, DATE_FORMAT(unavailable_date, '%Y-%m-%d') AS unavailable_date, reason
     FROM doctor_unavailable_dates
     WHERE doctor_id IN (${placeholders}) AND unavailable_date BETWEEN ? AND ?`,
    [...doctorIds, start, end]
  )
  const [appointments] = await executor.query(
    `SELECT doctor_id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
     FROM appointments
     WHERE doctor_id IN (${placeholders})
       AND appointment_date BETWEEN ? AND ?
       AND status IN ('pending','confirmed','rescheduled','in-progress')`,
    [...doctorIds, start, end]
  )

  const scheduleMap = new Map()
  for (const row of schedules) {
    const id = Number(row.doctor_id)
    if (!scheduleMap.has(id)) scheduleMap.set(id, [])
    scheduleMap.get(id).push(row)
  }
  const blockedMap = new Map(blocks.map((row) => [`${Number(row.doctor_id)}:${row.unavailable_date}`, row]))
  const takenMap = new Map()
  for (const row of appointments) {
    const key = `${Number(row.doctor_id)}:${row.appointment_date}`
    if (!takenMap.has(key)) takenMap.set(key, new Set())
    takenMap.get(key).add(String(row.appointment_time || '').trim())
  }

  const nowParts = getZonedParts(new Date(), CLINIC_TIMEZONE)
  const today = getTodayDateOnly()
  const currentMinutes = nowParts.hours * 60 + nowParts.minutes + 5

  const result = doctors.map((doctor) => {
    const weekly = scheduleMap.get(Number(doctor.id)) || []
    const availability = []
    let nextAvailable = null

    for (let offset = 0; offset < safeDays; offset += 1) {
      const date = addDaysDateOnly(start, offset)
      const dateObj = new Date(`${date}T12:00:00Z`)
      const dayName = DAY_NAMES[dateObj.getUTCDay()]
      const schedule = weekly.find((row) => row.day_of_week === dayName && Number(row.is_active) !== 0)
      const block = blockedMap.get(`${Number(doctor.id)}:${date}`)
      const slots = []

      if (schedule && !block) {
        const startMinutes = parseTimeToMinutes(schedule.start_time)
        const endMinutes = parseTimeToMinutes(schedule.end_time)
        const duration = Math.max(1, Number(schedule.slot_duration_mins) || 60)
        const taken = takenMap.get(`${Number(doctor.id)}:${date}`) || new Set()
        if (startMinutes !== null && endMinutes !== null) {
          for (let cursor = startMinutes; cursor + duration <= endMinutes; cursor += duration) {
            const label = formatSlotLabel(cursor)
            const available = !taken.has(label) && !(date === today && cursor <= currentMinutes)
            slots.push({ time: label, available })
            if (available && !nextAvailable) nextAvailable = { date, time: label }
          }
        }
      }
      availability.push({ date, unavailable_reason: block?.reason || null, slots })
    }

    return {
      id: doctor.id,
      full_name: doctor.full_name,
      name: doctor.full_name,
      specialty: doctor.specialty,
      has_active_schedule: weekly.length > 0,
      weekly_schedule: weekly,
      next_available: nextAvailable,
      availability,
    }
  })

  return { start_date: start, end_date: end, days: safeDays, doctors: result }
}

module.exports = { buildDoctorAvailabilitySummary, formatSlotLabel }
