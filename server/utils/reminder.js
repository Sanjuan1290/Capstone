// server/utils/reminder.js
// FIX #4 — Daily cron job: sends appointment reminder emails every morning at 8 AM
//
// HOW TO ACTIVATE:
//   In server.js, inside the start() function after app.listen(), add:
//     require('./utils/reminder')

const db = require('../db/connect')
const { sendAppointmentReminder } = require('./emailService')

async function sendTomorrowReminders() {
  console.log('📧 [Reminder] Running appointment reminder job...')
  try {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const [appointments] = await db.query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
              p.email AS patient_email, p.full_name AS patient_name,
              d.full_name AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors  d ON a.doctor_id  = d.id
       WHERE a.appointment_date = ?
         AND a.status IN ('pending', 'confirmed')`,
      [tomorrowStr]
    )

    if (appointments.length === 0) {
      console.log('📧 [Reminder] No appointments tomorrow.')
      return
    }

    console.log(`📧 [Reminder] Sending ${appointments.length} reminder(s) for ${tomorrowStr}...`)

    for (const appt of appointments) {
      try {
        await sendAppointmentReminder({
          to:               appt.patient_email,
          patient_name:     appt.patient_name,
          doctor_name:      appt.doctor_name,
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
          clinic_type:      appt.clinic_type,
        })
        console.log(`   ✅ Sent to ${appt.patient_email}`)
      } catch (err) {
        console.error(`   ❌ Failed for ${appt.patient_email}:`, err.message)
      }
    }
  } catch (err) {
    console.error('📧 [Reminder] Job error:', err.message)
  }
}

// Schedule daily at 8:00 AM
function scheduleDaily(fn) {
  const now  = new Date()
  const next = new Date()
  next.setHours(8, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)

  const delay = next - now
  console.log(`📧 [Reminder] First run in ${Math.round(delay / 60000)} min (at 8:00 AM)`)

  setTimeout(() => {
    fn()
    setInterval(fn, 24 * 60 * 60 * 1000)
  }, delay)
}

scheduleDaily(sendTomorrowReminders)

module.exports = { sendTomorrowReminders }