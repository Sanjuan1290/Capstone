const https = require('https')
const { normalizePhilippinePhone } = require('./phone')
const {isGuestContact}=require('./guestContactPolicy')

const SEMAPHORE_HOST = 'api.semaphore.co'
const SEMAPHORE_BASE_PATH = '/api/v4'

const isSmsConfigured = () => (
  Boolean(String(process.env.SEMAPHORE_API_KEY || '').trim())
)

const getSemaphoreErrorMessage = (parsed, raw, statusCode) => {
  if (Array.isArray(parsed)) {
    const first = parsed.find(Boolean) || {}
    return (
      first.message
      || first.error
      || first.status
      || raw
      || `Semaphore request failed with status ${statusCode}`
    )
  }

  return parsed?.message || parsed?.error || raw || `Semaphore request failed with status ${statusCode}`
}

const requestSemaphore = (path, payload) => new Promise((resolve, reject) => {
  const body = new URLSearchParams(payload).toString()
  const req = https.request({
    hostname: SEMAPHORE_HOST,
    path: `${SEMAPHORE_BASE_PATH}${path}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    let raw = ''
    res.on('data', (chunk) => { raw += chunk })
    res.on('end', () => {
      let parsed = raw
      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        // Keep raw response for debugging.
      }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(parsed)
        return
      }

      const error = new Error(getSemaphoreErrorMessage(parsed, raw, res.statusCode))
      error.provider = 'semaphore'
      error.statusCode = res.statusCode
      error.responseBody = raw
      error.responseData = parsed
      reject(error)
    })
  })

  req.setTimeout(15000, () => req.destroy(new Error('SMS provider did not respond in time.')))
  req.on('error', reject)
  req.write(body)
  req.end()
})

const sendSemaphore = async (path, payload, fallbackLabel) => {
  if (!isSmsConfigured()) {
    console.warn(`[sms:missing-config] ${fallbackLabel}`)
    throw new Error('Semaphore SMS is not configured. Set SEMAPHORE_API_KEY in server/.env and restart the server.')
  }

  return requestSemaphore(path, {
    apikey: process.env.SEMAPHORE_API_KEY,
    ...(process.env.SEMAPHORE_SENDER_NAME ? { sendername: process.env.SEMAPHORE_SENDER_NAME } : {}),
    ...payload,
  })
}

const sendPatientRegistrationOtp = async ({ phone, code, fullName }) => {
  const normalized = normalizePhilippinePhone(phone)
  if (!normalized) throw new Error('A valid Philippine mobile number is required.')

  const message = 'Carait Clinic verification code: {otp}. It expires in 10 minutes.'
  const fallbackLabel = `OTP for ${fullName || 'patient'} (${normalized}): ${code}`

  return sendSemaphore('/otp', {
    number: normalized,
    message,
    code,
  }, fallbackLabel)
}

const sendPatientPasswordResetOtp = async ({ phone, code, fullName }) => {
  const normalized = normalizePhilippinePhone(phone)
  if (!normalized) throw new Error('A valid Philippine mobile number is required.')

  const message = 'Carait Clinic password reset code: {otp}. It expires in 10 minutes.'
  const fallbackLabel = `Password reset OTP for ${fullName || 'patient'} (${normalized}): ${code}`

  return sendSemaphore('/otp', {
    number: normalized,
    message,
    code,
  }, fallbackLabel)
}

const sendDoctorAppointmentSms = async ({
  doctorPhone,
  doctorName,
  patientName,
  clinicType,
  appointmentDate,
  appointmentTime,
  branchName,
}) => {
  const normalized = normalizePhilippinePhone(doctorPhone)
  if (!normalized) return { skipped: true }

  const clinicLabel = clinicType === 'derma' ? 'Dermatology' : 'General Medicine'
  const dateValue = new Date(appointmentDate)
  const dateLabel = Number.isNaN(dateValue.getTime()) ? String(appointmentDate).slice(0,10) : new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(dateValue)
  const message = `Carait Clinic: Dr. ${String(doctorName || '').replace(/^Dr\.?\s*/i, '').trim() || 'Doctor'}, a ${clinicLabel} appointment is confirmed for ${dateLabel} at ${appointmentTime}, ${String(branchName || 'clinic').slice(0, 50)}. Open your Doctor Portal for details.`

  return sendSemaphore('/messages', {
    number: normalized,
    message,
  }, `Doctor booking notice for ${doctorName || 'doctor'} (${normalized})`)
}

const sendPatientAppointmentStatusSms = async ({
  patientPhone,
  patientName,
  doctorName,
  appointmentDate,
  appointmentTime,
  status,
  notes,
}) => {
  const normalized = normalizePhilippinePhone(patientPhone)
  if (!normalized) return { skipped: true }
  if (await isGuestContact({phone:normalized})) return {skipped:true,reason:'guest_in_app_only'}

  const cleanDoctorName = String(doctorName || '').replace(/^Dr\.?\s*/i, '').trim() || 'your doctor'
  const patientLabel = String(patientName || '').trim() || 'Patient'
  const statusMessages = {
    confirmed: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} on ${appointmentDate} at ${appointmentTime} is confirmed.`,
    cancelled: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} on ${appointmentDate} at ${appointmentTime} has been cancelled.`,
    rescheduled: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} was moved to ${appointmentDate} at ${appointmentTime}.`,
    no_show: `Carait Clinic: Your appointment on ${appointmentDate} at ${appointmentTime} was marked no-show. Please contact the clinic before booking again.`,
    rejected: `Carait Clinic: Hi ${patientLabel}, your appointment request on ${appointmentDate} at ${appointmentTime} was not confirmed in time and the slot was released.`,
  }

  const baseMessage = statusMessages[status] || `Carait Clinic appointment update: ${appointmentDate} at ${appointmentTime}.`
  const message = notes ? `${baseMessage} Message: ${String(notes).trim()}` : baseMessage
  return sendSemaphore('/messages', {
    number: normalized,
    message,
  }, `Patient appointment ${status || 'update'} for ${patientLabel} (${normalized})`)
}


const sendPatientPhoneChangeOtp = async ({ phone, code, fullName }) => {
  const normalized = normalizePhilippinePhone(phone)
  if (!normalized) throw new Error('A valid Philippine mobile number is required.')
  const message = 'Carait Clinic mobile-number verification code: {otp}. It expires in 10 minutes.'
  return sendSemaphore('/otp', { number: normalized, message, code }, `Phone-change OTP for ${fullName || 'patient'} (${normalized})`)
}

const sendPatientAppointmentReminderSms = async ({patientPhone,appointment_date,appointment_time,doctor_name,branch_name,branch_phone}) => {
  const normalized=normalizePhilippinePhone(patientPhone)
  if(!normalized) return {skipped:true}
  if(await isGuestContact({phone:normalized}))return {skipped:true,reason:'guest_in_app_only'}
  const message=`CARAIT Clinic reminder: Your appointment with ${String(doctor_name||'your doctor').slice(0,45)} is on ${appointment_date} at ${appointment_time}, ${String(branch_name||'clinic').slice(0,45)}. No reply needed. ${branch_phone?`Contact: ${String(branch_phone).slice(0,25)}`:''}`
  return sendSemaphore('/messages',{number:normalized,message},'Appointment reminder')
}

module.exports = {
  isSmsConfigured,
  sendPatientAppointmentReminderSms,
  sendPatientRegistrationOtp,
  sendPatientPasswordResetOtp,
  sendPatientPhoneChangeOtp,
  sendDoctorAppointmentSms,
  sendPatientAppointmentStatusSms,
}

