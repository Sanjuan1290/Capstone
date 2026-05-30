const https = require('https')
const { normalizePhilippinePhone } = require('./phone')

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
}) => {
  const normalized = normalizePhilippinePhone(doctorPhone)
  if (!normalized) return { skipped: true }

  const clinicLabel = clinicType === 'derma' ? 'Dermatology' : 'General Medicine'
  const message = `Dr. ${String(doctorName || '').replace(/^Dr\.?\s*/i, '').trim() || 'Doctor'}, new ${clinicLabel} booking: ${patientName} on ${appointmentDate} at ${appointmentTime}.`

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
}) => {
  const normalized = normalizePhilippinePhone(patientPhone)
  if (!normalized) return { skipped: true }

  const cleanDoctorName = String(doctorName || '').replace(/^Dr\.?\s*/i, '').trim() || 'your doctor'
  const patientLabel = String(patientName || '').trim() || 'Patient'
  const statusMessages = {
    confirmed: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} on ${appointmentDate} at ${appointmentTime} is confirmed.`,
    cancelled: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} on ${appointmentDate} at ${appointmentTime} has been cancelled.`,
    rescheduled: `Carait Clinic: Hi ${patientLabel}, your appointment with Dr. ${cleanDoctorName} was moved to ${appointmentDate} at ${appointmentTime}.`,
    no_show: `Carait Clinic: Your appointment on ${appointmentDate} at ${appointmentTime} was marked no-show. Please contact the clinic before booking again.`,
  }

  return sendSemaphore('/messages', {
    number: normalized,
    message: statusMessages[status] || `Carait Clinic appointment update: ${appointmentDate} at ${appointmentTime}.`,
  }, `Patient appointment ${status || 'update'} for ${patientLabel} (${normalized})`)
}

module.exports = {
  isSmsConfigured,
  sendPatientRegistrationOtp,
  sendPatientPasswordResetOtp,
  sendDoctorAppointmentSms,
  sendPatientAppointmentStatusSms,
}
