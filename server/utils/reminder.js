const db = require('../db/connect')
const { sendAppointmentReminder } = require('./emailService')
const { markOverdueAppointments } = require('./appointments')
const { getTodayDateOnly, addDaysDateOnly, getNextClinicRunAt, CLINIC_TIMEZONE } = require('./date')

async function sendTomorrowReminders() {
  console.log(`[Reminder] Running appointment reminder job (${CLINIC_TIMEZONE})...`)
  try {
    await markOverdueAppointments()
    const tomorrowStr = addDaysDateOnly(getTodayDateOnly(), 1)

    const [appointments] = await db.query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
              p.email AS patient_email, p.full_name AS patient_name,
              d.full_name AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.appointment_date = ?
         AND a.status = 'confirmed'`,
      [tomorrowStr]
    )

    for (const appt of appointments) {
      if (!appt.patient_email) continue
      try {
        await sendAppointmentReminder({
          to: appt.patient_email,
          patient_name: appt.patient_name,
          doctor_name: appt.doctor_name,
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
          clinic_type: appt.clinic_type,
        })
      } catch (err) {
        console.error('[Reminder] Failed for %s: %s', appt.patient_email, err.message)
      }
    }
  } catch (err) {
    console.error('[Reminder] Job error:', err.message)
  }
}

function scheduleDaily(fn, hour = 8, minute = 0) {
  const scheduleNext = () => {
    const now = new Date()
    const next = getNextClinicRunAt(hour, minute, now)
    const delay = Math.max(1000, next.getTime() - now.getTime())
    setTimeout(async () => {
      try { await fn() } finally { scheduleNext() }
    }, delay)
  }
  scheduleNext()
}

scheduleDaily(sendTomorrowReminders)
setInterval(() => {
  markOverdueAppointments().catch(err => console.error('[Appointments] Overdue sync error:', err.message))
}, 15 * 60 * 1000)

module.exports = { sendTomorrowReminders, scheduleDaily }
