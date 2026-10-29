const db = require('../db/connect')
const { sendAppointmentReminder } = require('./emailService')
const { markOverdueAppointments } = require('./appointments')
const { expirePendingAppointments } = require('./pendingAppointmentExpiry')
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
        console.error('[Reminder] Appointment reminder delivery failed', { appointmentId: appt.id, code: err.code || 'EMAIL_DELIVERY_FAILED' })
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

// The legacy "tomorrow" job must not run alongside the durable reminder engine.
// It was undeduplicated and could send twice after a restart.
// Keep its function for existing callers but disable automatic invocation.
if (process.env.CARAIT_ENABLE_DURABLE_REMINDERS === 'true') {
  const {runAutomatic}=require('./appointmentReminders')
  const run=()=>runAutomatic().catch(err=>console.error('[Reminders] Worker error:',err.code||'REMINDER_WORKER_ERROR'))
  run()
  setInterval(run,60*1000)
}
expirePendingAppointments().catch(err => console.error('[Appointments] Pending expiry sync error:', err.message))
setInterval(() => {
  expirePendingAppointments().catch(err => console.error('[Appointments] Pending expiry sync error:', err.message))
}, 60 * 1000)
setInterval(() => {
  markOverdueAppointments().catch(err => console.error('[Appointments] Overdue sync error:', err.message))
}, 60 * 1000)

module.exports = { sendTomorrowReminders, scheduleDaily }

