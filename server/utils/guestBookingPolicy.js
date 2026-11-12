const crypto = require('node:crypto')
const jwt = require('jsonwebtoken')
const { getTodayDateOnly, addDaysDateOnly, zonedDateTimeToUtc } = require('./date')

const DAILY_LIMIT = 3
const VERIFIED_COOKIE = 'guest_booking_phone'
const VERIFICATION_SECONDS = 30 * 60
const PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.phone,'+',''),'-',''),' ',''),'(',''),')','')"
const phoneVariants = phone => [phone, '0' + phone.slice(2), phone.slice(2)]
const fail = (statusCode, code, message, details) => Object.assign(new Error(message), { statusCode, code, details })
const signingSecret = () => {
  if (String(process.env.JWT_SECRET || '').length < 32) throw fail(503, 'GUEST_VERIFICATION_UNAVAILABLE', 'Guest verification is temporarily unavailable.')
  return process.env.JWT_SECRET
}
const verificationProof = req => {
  try {
    const proof = jwt.verify(String(req.cookies?.[VERIFIED_COOKIE] || ''), signingSecret(), { algorithms: ['HS256'], audience: 'guest-booking' })
    return proof.purpose === 'guest_booking_phone' && /^639\d{9}$/.test(proof.phone) && Number.isFinite(proof.exp) ? proof : null
  } catch { return null }
}
const verifiedPhone = req => verificationProof(req)?.phone || null
const issuePhoneProof = (res, phone) => {
  const token = jwt.sign({ purpose: 'guest_booking_phone', phone }, signingSecret(), { algorithm: 'HS256', audience: 'guest-booking', expiresIn: VERIFICATION_SECONDS, jwtid: crypto.randomUUID() })
  res.cookie(VERIFIED_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/api/patient/guest', maxAge: VERIFICATION_SECONDS * 1000 })
}
const readDailyQuota = async (executor, phone, now = new Date()) => {
  const day = getTodayDateOnly(now, 'Asia/Manila')
  const nextDay = addDaysDateOnly(day, 1)
  const [year, month, date] = nextDay.split('-').map(Number)
  const reset = zonedDateTimeToUtc({ year, month, day: date }, 'Asia/Manila')
  const [[row]] = await executor.query(
    'SELECT COUNT(*) AS used FROM appointments a JOIN patients p ON p.id=a.patient_id ' +
    'WHERE a.appointment_source=\'guest_online\' AND ' + PHONE_SQL + ' IN (?,?,?) AND a.created_at>=? AND a.created_at<?',
    [...phoneVariants(phone), day + ' 00:00:00', nextDay + ' 00:00:00']
  )
  const used = Number(row?.used || 0)
  return { limit: DAILY_LIMIT, used, remaining: Math.max(0, DAILY_LIMIT - used), resets_at: reset.toISOString() }
}
const findPhonePatients = async (executor, phone, forUpdate = false) => {
  const [rows] = await executor.query('SELECT p.id,p.full_name,p.birthdate,p.reported_age,COALESCE(p.gender,p.sex) AS gender,p.phone,p.email,p.address,p.consent_method,' +
    '(p.password IS NOT NULL AND p.password<>\'\') AS has_password FROM patients p WHERE ' + PHONE_SQL + ' IN (?,?,?) LIMIT 2' + (forUpdate ? ' FOR UPDATE' : ''), phoneVariants(phone))
  return rows
}
const verificationState = async (executor, phone, expiresAt) => {
  const [patients, daily_limit] = await Promise.all([findPhonePatients(executor, phone), readDailyQuota(executor, phone)])
  const patient = patients.length === 1 && patients[0].consent_method === 'guest_online' && !Number(patients[0].has_password) ? patients[0] : null
  return { verified: true, phone, expires_at: expiresAt, daily_limit,
    requires_sign_in: patients.some(row => Number(row.has_password) || row.consent_method !== 'guest_online'),
    needs_clinic_help: patients.length > 1,
    patient: patient ? { full_name: patient.full_name, gender: patient.gender, birthdate: patient.birthdate ? String(patient.birthdate).slice(0,10) : '', reported_age: patient.reported_age ?? '', phone, email: patient.email || '', address: patient.address || '' } : null }
}
const assertQuota = quota => {
  if (quota.remaining <= 0) throw fail(429, 'GUEST_DAILY_LIMIT', 'You have reached the limit of 3 guest bookings today. Please try again tomorrow.', quota)
}
const submissionToken = (key, phone) => {
  if (key == null || key === '') return crypto.randomBytes(32).toString('base64url')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(key))) throw fail(400, 'INVALID_SUBMISSION_KEY', 'Refresh the booking page and try again.')
  return crypto.createHmac('sha256', signingSecret()).update('guest-booking:v1:' + phone + ':' + key).digest('base64url')
}
module.exports = { DAILY_LIMIT, VERIFIED_COOKIE, VERIFICATION_SECONDS, PHONE_SQL, phoneVariants, verifiedPhone, verificationProof, issuePhoneProof, verificationState, findPhonePatients, readDailyQuota, assertQuota, submissionToken, fail }
