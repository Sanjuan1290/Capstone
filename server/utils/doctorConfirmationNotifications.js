// Global Super Admin-controlled doctor appointment confirmation channels.
// This runs only after a pending appointment actually changes to confirmed.
const db = require('../db/connect')
const { sendResendEmail } = require('./resendEmail')
const { sendDoctorAppointmentSms } = require('./smsService')
const { formatAppointmentDate } = require('./emailService')

const table = 'system_doctor_confirmation_notifications'
const parseSwitch = (value, field) => {
  if (value === true || value === 1) return 1
  if (value === false || value === 0) return 0
  const error = new Error(`${field} must be true or false.`)
  error.code = 'INVALID_NOTIFICATION_SETTING'
  error.statusCode = 400
  throw error
}

const readSettings = async (executor = db) => {
  const [[row]] = await executor.query(
    `SELECT send_email,send_sms,updated_at FROM ${table} WHERE id=1 LIMIT 1`
  )
  if (!row) {
    const error = new Error('Doctor notification settings are unavailable. Run the reviewed migration.')
    error.code = 'DOCTOR_NOTIFICATION_SETTINGS_MISSING'
    error.statusCode = 503
    throw error
  }
  return { send_email: Boolean(Number(row.send_email)), send_sms: Boolean(Number(row.send_sms)), updated_at: row.updated_at }
}

const saveSettings = async (options, adminId, executor = db) => {
  const sendEmail = parseSwitch(options?.send_email, 'Email notifications')
  const sendSms = parseSwitch(options?.send_sms, 'SMS notifications')
  const [result] = await executor.query(
    `UPDATE ${table} SET send_email=?,send_sms=?,updated_by_admin_id=? WHERE id=1`,
    [sendEmail, sendSms, Number(adminId)]
  )
  if (!result.affectedRows) throw Object.assign(new Error('Doctor notification settings are unavailable. Run the migration.'), {statusCode:503})
  return readSettings(executor)
}

const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const sendDoctorConfirmationEmail = async ({ email, name, date, time, clinic, branch, appointmentId }) => {
  const url = `${String(process.env.CLIENT_URL || 'https://caraitclinic.com').replace(/\/$/, '')}/doctor/appointments`
  const formattedDate = formatAppointmentDate(date)
  return sendResendEmail({
    to: email,
    subject: 'Carait Clinic - Appointment confirmed on your schedule',
    // No diagnosis, clinical notes, phone, or private patient information in external messages.
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#0b1a2c">
      <h2>New confirmed appointment</h2>
      <p>Hi Dr. ${htmlEscape(String(name).replace(/^Dr\.?\s*/i, ''))},</p>
      <p>An appointment has been confirmed on your schedule.</p>
      <p><b>Date:</b> ${htmlEscape(formattedDate)}</p>
      <p><b>Time:</b> ${htmlEscape(time)}</p>
      <p><b>Clinic:</b> ${htmlEscape(clinic === 'derma' ? 'Dermatology' : 'General Medicine')}</p>
      <p><b>Branch:</b> ${htmlEscape(branch || 'Carait Clinic')}</p>
      <p>Sign in to your Doctor Portal for the appointment details.</p>
      <p><a href="${htmlEscape(url)}">Open Doctor Appointments</a></p>
    </div>`,
    idempotencyKey: `doctor-confirm-${appointmentId}`,
  })
}

const notifyDoctorOnConfirmation = async ({ appointmentId, doctorId, appointmentDate, appointmentTime, clinicType, branchId }, executor = db, delivery = {}) => {
  const settings = await readSettings(executor)
  if (!settings.send_email && !settings.send_sms) return { email:'disabled', sms:'disabled' }
  const [[doctor]] = await executor.query('SELECT full_name,email,phone FROM doctors WHERE id=? AND is_active=1 LIMIT 1', [doctorId])
  if (!doctor) return {email:'skipped',sms:'skipped'}
  const [[branch]] = await executor.query('SELECT name FROM clinic_branches WHERE id=? LIMIT 1', [branchId])
  const payload = { email:doctor.email, name:doctor.full_name, date:appointmentDate, time:appointmentTime, clinic:clinicType, branch:branch?.name, appointmentId }
  const sender = delivery.sendEmail || sendDoctorConfirmationEmail
  const smsSender = delivery.sendSms || sendDoctorAppointmentSms
  const results = await Promise.allSettled([
    settings.send_email && doctor.email ? sender(payload) : Promise.resolve(null),
    settings.send_sms && doctor.phone ? smsSender({doctorPhone:doctor.phone,doctorName:doctor.full_name,clinicType,appointmentDate,appointmentTime,branchName:branch?.name}) : Promise.resolve(null),
  ])
  const status = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value?.skipped) return 'invalid_phone'
      return result.value ? 'sent' : (index === 0 ? (settings.send_email ? 'no_email' : 'disabled') : (settings.send_sms ? 'no_phone' : 'disabled'))
    }
    console.error(`[doctor-confirmation] ${index===0?'email':'sms'} failed`, {appointmentId, code:result.reason?.code, message:result.reason?.message})
    return 'failed'
  })
  return { email:status[0], sms:status[1] }
}

module.exports = { parseSwitch, readSettings, saveSettings, notifyDoctorOnConfirmation, sendDoctorConfirmationEmail }
