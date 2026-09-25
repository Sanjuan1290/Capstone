const db = require('../db/connect')
const { getTodayDateOnly, addDaysDateOnly, getZonedParts, CLINIC_TIMEZONE } = require('./date')
const {
  buildSlotsForCalendarDate,
  formatSlotLabel,
  parseTimeToMinutes,
  getCalendarDateScheduleSegments,
} = require('./scheduleWindows')

const clinicMatchesDoctor = (clinicType, doctor) => {
  if (!clinicType) return true
  const explicit = String(doctor?.clinic_type || '').trim()
  if (['medical', 'derma'].includes(explicit)) return clinicType === explicit
  const isDerma = String(doctor?.specialty || '').toLowerCase().includes('derm')
  return clinicType === 'derma' ? isDerma : clinicType === 'medical' ? !isDerma : false
}

const buildDoctorAvailabilitySummary = async ({ clinicType = '', startDate, days = 7, doctorId = null } = {}, executor = db) => {
  const safeDays = Math.min(14, Math.max(1, Number(days) || 7))
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) ? String(startDate) : getTodayDateOnly()
  const end = addDaysDateOnly(start, safeDays - 1)
  const numericDoctorId = Number(doctorId) || 0

  const doctorParams = []
  let doctorSql = `SELECT id, full_name, specialty, clinic_type
                   FROM doctors
                   WHERE is_active = 1`
  if (numericDoctorId) {
    doctorSql += ' AND id = ?'
    doctorParams.push(numericDoctorId)
  }
  doctorSql += ' ORDER BY full_name'

  const [doctorRows] = await executor.query(doctorSql, doctorParams)
  const doctors = doctorRows.filter((doctor) => clinicMatchesDoctor(clinicType, doctor))
  if (!doctors.length) return { start_date: start, end_date: end, days: safeDays, doctors: [] }

  const doctorIds = doctors.map((doctor) => Number(doctor.id))
  const placeholders = doctorIds.map(() => '?').join(',')

  const [schedules] = await executor.query(
    `SELECT doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active,
            COALESCE(spans_next_day,0) AS spans_next_day,
            COALESCE(is_24_hours,0) AS is_24_hours
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
    const parsed = parseTimeToMinutes(row.appointment_time)
    takenMap.get(key).add(parsed === null ? String(row.appointment_time || '').trim() : formatSlotLabel(parsed))
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
      const block = blockedMap.get(`${Number(doctor.id)}:${date}`)
      const taken = takenMap.get(`${Number(doctor.id)}:${date}`) || new Set()
      const slots = buildSlotsForCalendarDate({
        date,
        schedules: weekly,
        takenSlots: [...taken],
        unavailable: Boolean(block),
        nowMinutes: date === today ? currentMinutes : null,
      }).map(({ time, available, state }) => ({ time, available, state }))

      for (const slot of slots) {
        if (slot.available && !nextAvailable) nextAvailable = { date, time: slot.time }
      }
      availability.push({ date, unavailable_reason: block?.reason || null, slots })
    }

    return {
      id: doctor.id,
      full_name: doctor.full_name,
      name: doctor.full_name,
      specialty: doctor.specialty,
      clinic_type: doctor.clinic_type,
      has_active_schedule: weekly.length > 0,
      weekly_schedule: weekly,
      next_available: nextAvailable,
      availability,
    }
  })

  return { start_date: start, end_date: end, days: safeDays, doctors: result }
}

const buildWalkInDoctorAvailability = async ({ clinicType = '' } = {}, executor = db) => {
  if (clinicType && !['medical', 'derma'].includes(clinicType)) {
    const error = new Error('Select a valid clinic type.')
    error.statusCode = 400
    throw error
  }

  const today = getTodayDateOnly()
  const summary = await buildDoctorAvailabilitySummary({ clinicType, startDate: today, days: 1 }, executor)
  const doctors = summary.doctors || []
  if (!doctors.length) return { date: today, doctors: [] }

  const doctorIds = doctors.map((doctor) => Number(doctor.id))
  const placeholders = doctorIds.map(() => '?').join(',')
  const [queueRows] = await executor.query(
    `SELECT doctor_id, COUNT(*) AS active_queue_count
     FROM queue
     WHERE queue_date = ?
       AND doctor_id IN (${placeholders})
       AND status IN ('waiting','called','in_consultation')
     GROUP BY doctor_id`,
    [today, ...doctorIds]
  )
  const queueMap = new Map(queueRows.map((row) => [Number(row.doctor_id), Number(row.active_queue_count || 0)]))

  const now = getZonedParts(new Date(), CLINIC_TIMEZONE)
  const currentMinutes = now.hours * 60 + now.minutes

  const result = doctors.map((doctor) => {
    const day = doctor.availability?.[0] || { slots: [] }
    const segments = getCalendarDateScheduleSegments(today, doctor.weekly_schedule || [])
    const currentSegment = segments.find((segment) => currentMinutes >= segment.start && currentMinutes < segment.end) || null
    const onDutyNow = Boolean(currentSegment) && !day.unavailable_reason
    const openSlots = (day.slots || []).filter((slot) => slot.available)
    const nextAvailable = openSlots[0]?.time || null
    const is24Hours = Boolean(currentSegment && Number(currentSegment.schedule?.is_24_hours || 0) === 1)
    const scheduleLabel = currentSegment
      ? (is24Hours
        ? 'Available 24 hours'
        : `${formatSlotLabel(currentSegment.start)} – ${formatSlotLabel(currentSegment.end)}`)
      : null

    let availabilityReason = null
    if (day.unavailable_reason) availabilityReason = day.unavailable_reason
    else if (!onDutyNow) availabilityReason = 'Not currently on duty.'
    else if (!nextAvailable) availabilityReason = 'No remaining open appointment slots today.'

    return {
      id: doctor.id,
      full_name: doctor.full_name,
      name: doctor.full_name,
      specialty: doctor.specialty,
      clinic_type: doctor.clinic_type,
      on_duty_now: onDutyNow,
      available_now: onDutyNow && Boolean(nextAvailable),
      availability_reason: availabilityReason,
      current_schedule: scheduleLabel,
      next_available_slot: nextAvailable,
      active_queue_count: queueMap.get(Number(doctor.id)) || 0,
      slots: day.slots || [],
    }
  })

  result.sort((a, b) => {
    if (a.available_now !== b.available_now) return a.available_now ? -1 : 1
    if (a.active_queue_count !== b.active_queue_count) return a.active_queue_count - b.active_queue_count
    return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'en', { sensitivity: 'base' })
  })

  return { date: today, doctors: result }
}

module.exports = {
  clinicMatchesDoctor,
  buildDoctorAvailabilitySummary,
  buildWalkInDoctorAvailability,
  formatSlotLabel,
}

