const db = require('../db/connect')
const { sendAppointmentReminder } = require('./emailService')
const { markOverdueAppointments } = require('./appointments')
const { getTodayDateOnly } = require('./date')

async function sendTomorrowReminders() {
  console.log('[Reminder] Running appointment reminder job...')
  try {
    await markOverdueAppointments()

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = getTodayDateOnly(tomorrow)

    const [appointments] = await db.query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
              p.email AS patient_email, p.full_name AS patient_name,
              d.full_name AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.appointment_date = ?
         AND a.status IN ('pending', 'confirmed')`,
      [tomorrowStr]
    )

    for (const appt of appointments) {
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

function scheduleDaily(fn) {
  const now = new Date()
  const next = new Date()
  next.setHours(8, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)

  const delay = next - now

  setTimeout(() => {
    fn()
    setInterval(fn, 24 * 60 * 60 * 1000)
  }, delay)
}

scheduleDaily(sendTomorrowReminders)
setInterval(() => {
  markOverdueAppointments().catch(err => console.error('[Appointments] Overdue sync error:', err.message))
}, 15 * 60 * 1000)

module.exports = { sendTomorrowReminders }
