const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { issueSession, verifySessionToken } = require('../utils/sessionSecurity')
const { validatePassword } = require('../utils/accountSecurity')
const { makeNumericCode, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')
const { sendAppointmentStatusEmail } = require('../utils/emailService')
const { notifyRoles, createNotification } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly } = require('../utils/date')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientRegistrationOtp } = require('../utils/smsService')
const { buildDoctorAvailabilitySummary } = require('../utils/doctorAvailabilitySummary')
const { getDoctorUnavailableDates, getDoctorUnavailableDate } = require('../utils/doctorAvailability')
const { loadImagesForConsultationIds } = require('../utils/consultationImages')
const {
  normalizePatientProfileInput,
  getPatientProfileStatus,
  toDateOnly,
  isValidDateOnly,
  validateBirthdate,
} = require('../utils/patientProfile')
const { validateAppointmentSlot, getAvailableAppointmentSlots, getAppointmentReservedDuration, withAppointmentSlotLock, assertAppointmentTransition, assertAppointmentMutationApplied } = require('../utils/appointmentSecurity')
const { loadBookingSettings, roundReservedDurationMinutes, buildConfirmationDeadlineSql } = require('../utils/bookingPolicy')
const { expirePendingAppointments } = require('../utils/pendingAppointmentExpiry')
const { writeAuditLog } = require('../utils/audit')
const { listBillingCatalog } = require('../utils/billing')
const { assertPlainObject, normalizeText } = require('../utils/inputValidation')
const { listCancellationReasons, resolveCancellationInput } = require('../utils/appointmentCancellation')
const { getOnlineBookingReadiness } = require('../utils/bookingReadiness')
const { isOtherVisitReason, withSystemOtherVisitReason } = require('../utils/appointmentReasons')

const OTP_EXPIRY_MS = 10 * 60 * 1000
const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

const buildPatientAuthUser = (patient) => ({
  id: patient.id,
  full_name: patient.full_name,
  email: patient.email,
  email_verified_at: patient.email_verified_at || null,
  phone: patient.phone,
  gender: patient.gender || patient.sex || null,
  role: 'patient',
  theme_preference: patient.theme_preference || 'light',
  profile_image_url: patient.profile_image_url || null,
  is_profile_complete: Boolean(patient.is_profile_complete),
  onboarding_completed_at: patient.onboarding_completed_at || null,
})

const loadPatientById = async (id) => {
  const [rows] = await db.query(
    `SELECT
       id,
       full_name,
       email,
       email_verified_at,
       phone,
       birthdate,
       gender,
       sex,
       civil_status,
       address,
       receive_promotions,
       is_profile_complete,
       theme_preference,
       profile_image_url,
       onboarding_completed_at
     FROM patients
     WHERE id = ?`,
    [id]
  )
  return rows[0] || null
}

const syncPatientProfileStatus = async (patient) => {
  const status = getPatientProfileStatus(patient)
  if (Number(Boolean(patient?.is_profile_complete)) !== Number(status.is_profile_complete)) {
    await db.query('UPDATE patients SET is_profile_complete = ? WHERE id = ?', [
      status.is_profile_complete ? 1 : 0,
      patient.id,
    ])
  }

  return {
    ...patient,
    is_profile_complete: status.is_profile_complete ? 1 : 0,
    missing_fields: status.missing_fields,
  }
}

const getProfileResponse = (patient) => ({
  full_name: patient.full_name,
  phone: patient.phone,
  email: patient.email,
  birthdate: patient.birthdate ? toDateOnly(patient.birthdate) : null,
  gender: patient.gender || patient.sex || null,
  address: patient.address,
  receive_promotions: Boolean(patient.receive_promotions),
  is_profile_complete: Boolean(patient.is_profile_complete),
  onboarding_completed_at: patient.onboarding_completed_at || null,
})

const issuePatientSession = async (res, patientId) => issueSession(res, 'patient', patientId)

const parseVerificationPayload = (rawPayload) => {
  if (!rawPayload) return {}
  if (typeof rawPayload === 'object') return rawPayload
  if (typeof rawPayload === 'string') return JSON.parse(rawPayload)
  return {}
}

const getPhoneVariants = (value) => {
  const normalizedPhone = normalizePhilippinePhone(value)
  if (!normalizedPhone) return []

  return Array.from(new Set([
    normalizedPhone,
    `0${normalizedPhone.slice(2)}`,
    normalizedPhone.slice(2),
  ]))
}

const findPatientsByPhone = async (phone, columns = '*') => {
  const variants = getPhoneVariants(phone)
  if (variants.length === 0) return []

  const placeholders = variants.map(() => '?').join(', ')
  const [rows] = await db.query(
    `SELECT ${columns}
     FROM patients
     WHERE ${NORMALIZED_PHONE_SQL} IN (${placeholders})`,
    variants
  )
  return rows
}

const register = async (req, res) => {
  assertPlainObject(req.body)
  const fullName = normalizeText(req.body.full_name, { field: 'Full Name', required: true, max: 150 })
  const emailInput = normalizeText(req.body.email, { field: 'Email Address', required: true, max: 150 })
  const phoneInput = normalizeText(req.body.phone, { field: 'Mobile Number', required: true, max: 20 })
  const birthdate = normalizeText(req.body.birthdate, { field: 'Birthdate', required: true, max: 10 })
  const gender = normalizeText(req.body.gender, { field: 'Gender', required: true, max: 10 })
  const address = normalizeText(req.body.address, { field: 'Address', required: true, max: 500, multiline: true })
  const password = normalizeText(req.body.password, { field: 'Password', required: true, max: 128 })
  const confirmPassword = normalizeText(req.body.confirmPassword, { field: 'Confirm Password', required: true, max: 128 })
  const method = 'sms'
  const consentGiven = req.body.consent_given === true || req.body.consent_given === 1 || req.body.consent_given === '1'

  if (!['Male', 'Female', 'Other'].includes(gender)) {
    return res.status(400).json({ message: 'Gender must be Male, Female, or Other.', field: 'Gender' })
  }
  const birthdateError = validateBirthdate(birthdate)
  if (birthdateError) return res.status(400).json({ message: birthdateError, field: 'Birthdate' })
  const normalizedProfile = normalizePatientProfileInput({ email: emailInput, birthdate, gender, address, receive_promotions: req.body.receive_promotions === true })
  if (!normalizedProfile.email || !normalizedProfile.birthdate || !normalizedProfile.gender || !normalizedProfile.address) {
    return res.status(400).json({ message: 'Complete all required patient information.' })
  }
  if (normalizedProfile.email.length > 150) {
    return res.status(400).json({ message: 'Email Address must be 150 characters or fewer.', field: 'Email Address' })
  }
  const [existingEmail] = await db.query('SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1', [normalizedProfile.email])
  if (existingEmail.length) return res.status(409).json({ message: 'That email address is already linked to another patient account.' })

  const normalizedPhone = normalizePhilippinePhone(phoneInput)
  if (!normalizedPhone) {
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.', field: 'Mobile Number' })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.', field: 'Confirm Password' })
  }

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ message: passwordError, field: 'Password' })

  if (!consentGiven) {
    return res.status(400).json({ message: 'Data privacy consent is required.', field: 'Consent' })
  }

  const existing = await findPatientsByPhone(normalizedPhone, 'id, is_walk_in')
  if (existing.length > 1) {
    return res.status(409).json({
      message: 'Multiple patient records use this phone number. Please contact the clinic to resolve the duplicate records.',
    })
  }
  if (existing.length === 1 && !existing[0].is_walk_in) {
    return res.status(409).json({ message: 'An account with that phone number already exists.' })
  }

  const [emailRows] = await db.query(
    'SELECT id FROM patients WHERE LOWER(email) = LOWER(?) AND COALESCE(is_walk_in, 0) = 0 LIMIT 1',
    [normalizedProfile.email]
  )
  if (emailRows.length) return res.status(409).json({ message: 'An account with that email address already exists.' })

  const hashedPassword = await bcrypt.hash(password, 10)
  const code = makeNumericCode()
  const payload = JSON.stringify({
    full_name: fullName,
    email: normalizedProfile.email,
    phone: normalizedPhone,
    birthdate: normalizedProfile.birthdate,
    gender: normalizedProfile.gender,
    address: normalizedProfile.address,
    password: hashedPassword,
    consent_given: true,
    receive_promotions: normalizedProfile.receive_promotions ? 1 : 0,
    verification_method: method,
  })

  await db.query(
    `INSERT INTO patient_phone_verifications (phone, otp_code, payload, expires_at, verified_at, attempt_count, last_sent_at)
     VALUES (?, ?, ?, ?, NULL, 0, NOW())
     ON DUPLICATE KEY UPDATE
       otp_code = VALUES(otp_code),
       payload = VALUES(payload),
       expires_at = VALUES(expires_at),
       verified_at = NULL,
       attempt_count = 0,
       last_sent_at = NOW()`,
    [normalizedPhone, hashSecret(code), payload, new Date(Date.now() + OTP_EXPIRY_MS)]
  )

  try {
    await sendPatientRegistrationOtp({
      phone: normalizedPhone,
      code,
      fullName,
    })
  } catch (err) {
    console.error('Patient registration SMS OTP failed:', {
      message: err.message,
      statusCode: err.statusCode,
      responseBody: err.responseBody,
    })

    return res.status(502).json({
      message: 'Failed to send the SMS verification code. Please try again later.',
    })
  }

  res.status(200).json({
    message: 'SMS verification code sent.',
    phone: normalizedPhone,
    verification_method: 'sms',
  })
}

const resendRegistrationVerification = async (req, res) => {
  assertPlainObject(req.body)
  const phoneInput = normalizeText(req.body.phone, { field: 'Mobile Number', required: true, max: 20 })
  const method = 'sms'
  const normalizedPhone = normalizePhilippinePhone(phoneInput)
  if (!normalizedPhone) {
    return res.status(400).json({ message: 'A valid Philippine mobile number is required.' })
  }
  const [rows] = await db.query('SELECT * FROM patient_phone_verifications WHERE phone = ? LIMIT 1', [normalizedPhone])
  if (!rows.length) return res.status(404).json({ message: 'No pending registration was found. Please register again.' })
  const pending = rows[0]
  let payload
  try { payload = parseVerificationPayload(pending.payload) } catch { return res.status(400).json({ message: 'Registration data is no longer valid. Please register again.' }) }
  const code = makeNumericCode()
  payload.verification_method = method
  await db.query(
    'UPDATE patient_phone_verifications SET otp_code = ?, payload = ?, expires_at = ?, attempt_count = 0, last_sent_at = NOW() WHERE id = ?',
    [hashSecret(code), JSON.stringify(payload), new Date(Date.now() + OTP_EXPIRY_MS), pending.id]
  )
  await sendPatientRegistrationOtp({ phone: normalizedPhone, code, fullName: payload.full_name })
  return res.json({
    message: 'SMS verification code sent.',
    method: 'sms',
    phone: normalizedPhone,
  })
}

const verifyRegistration = async (req, res) => {
  assertPlainObject(req.body)
  const phoneInput = normalizeText(req.body.phone, { field: 'Mobile Number', required: true, max: 20 })
  const code = normalizeText(req.body.code, { field: 'Verification Code', required: true, max: 6 })
  const normalizedPhone = normalizePhilippinePhone(phoneInput)
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter the complete 6-digit verification code.', field: 'Verification Code' })

  if (!normalizedPhone || !code) {
    return res.status(400).json({ message: 'Phone number and verification code are required.' })
  }

  const [rows] = await db.query(
    'SELECT * FROM patient_phone_verifications WHERE phone = ? AND expires_at > NOW()',
    [normalizedPhone]
  )

  if (rows.length === 0) {
    return res.status(400).json({ message: 'Verification code expired or no pending registration was found.' })
  }

  const pending = rows[0]
  if (Number(pending.attempt_count || 0) >= 5 || !timingSafeEqualHash(code, pending.otp_code)) {
    const nextAttempts = Number(pending.attempt_count || 0) + 1
    if (nextAttempts >= 5) await db.query('DELETE FROM patient_phone_verifications WHERE id = ?', [pending.id])
    else await db.query('UPDATE patient_phone_verifications SET attempt_count = ? WHERE id = ?', [nextAttempts, pending.id])
    return res.status(400).json({ message: 'Invalid verification code.' })
  }

  const existing = await findPatientsByPhone(normalizedPhone, 'id, is_walk_in')
  if (existing.length > 1) {
    await db.query('DELETE FROM patient_phone_verifications WHERE id = ?', [pending.id])
    return res.status(409).json({
      message: 'Multiple patient records use this phone number. Please contact the clinic to resolve the duplicate records.',
    })
  }
  if (existing.length === 1 && !existing[0].is_walk_in) {
    await db.query('DELETE FROM patient_phone_verifications WHERE id = ?', [pending.id])
    return res.status(409).json({ message: 'An account with that phone number already exists.' })
  }

  let payload
  try {
    payload = parseVerificationPayload(pending.payload)
  } catch {
    await db.query('DELETE FROM patient_phone_verifications WHERE id = ?', [pending.id])
    return res.status(500).json({ message: 'Stored verification data is invalid. Please register again.' })
  }
  let patientId
  if (existing.length === 1) {
    await db.query(
      `UPDATE patients
       SET full_name = ?, email = ?, phone = ?, birthdate = ?, gender = ?, sex = ?, address = ?, password = ?,
           civil_status = NULL, consent_given = ?, consent_given_at = ?, receive_promotions = ?, is_profile_complete = 1,
           email_verified_at = email_verified_at,
           phone_verified_at = NOW()
       WHERE id = ?`,
      [
        payload.full_name, payload.email, normalizedPhone, payload.birthdate, payload.gender, payload.gender, payload.address,
        payload.password, payload.consent_given ? 1 : 0, payload.consent_given ? new Date() : null,
        payload.receive_promotions ? 1 : 0, existing[0].id,
      ]
    )
    patientId = existing[0].id
  } else {
    const [result] = await db.query(
      `INSERT INTO patients
        (full_name, birthdate, gender, sex, civil_status, phone, address, email, password, consent_given, consent_given_at, receive_promotions, is_profile_complete, email_verified_at, phone_verified_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        payload.full_name, payload.birthdate, payload.gender, payload.gender, normalizedPhone, payload.address, payload.email,
        payload.password, payload.consent_given ? 1 : 0, payload.consent_given ? new Date() : null,
        payload.receive_promotions ? 1 : 0,
        null,
        new Date(),
      ]
    )
    patientId = result.insertId
  }

  if (payload.consent_given) {
    await db.query(
      'INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)',
      [patientId, 'data_processing', req.ip || null]
    )
  }

  await db.query('DELETE FROM patient_phone_verifications WHERE id = ?', [pending.id])

  await issuePatientSession(res, patientId)
  const createdPatient = await loadPatientById(patientId)

  res.status(201).json({
    message: 'Registration successful.',
    user: buildPatientAuthUser(createdPatient),
  })
}

const login = async (req, res) => {
  const { phone, email, password } = req.body
  if ((!phone && !email) || !password) {
    return res.status(400).json({ message: 'Email or mobile number and password are required.' })
  }

  let rows
  if (phone) {
    const normalizedPhone = normalizePhilippinePhone(phone)
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
    }
    rows = await findPatientsByPhone(normalizedPhone)
    if (rows.length > 1) {
      return res.status(409).json({
        message: 'Multiple patient records use this phone number. Please contact the clinic to resolve the duplicate records.',
      })
    }
  } else {
    ;[rows] = await db.query('SELECT * FROM patients WHERE LOWER(email) = LOWER(?)', [String(email || '').trim()])
  }

  if (rows.length === 0) {
    await writeAuditLog({ userRole: 'patient', action: 'auth.login_failed', entityType: 'patient', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email/mobile number or password.' })
  }

  const patient = rows[0]
  if (phone && !patient.phone_verified_at) {
    await writeAuditLog({ userId: patient.id, userRole: 'patient', action: 'auth.login_failed', entityType: 'patient', entityId: patient.id, newValues: { reason: 'unverified_phone_login' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'This mobile number has not been verified for sign-in. Use your verified email address instead.' })
  }
  const match = await bcrypt.compare(password, patient.password)
  if (!match) {
    await writeAuditLog({ userId: patient.id, userRole: 'patient', action: 'auth.login_failed', entityType: 'patient', entityId: patient.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email/mobile number or password.' })
  }

  await issuePatientSession(res, patient.id)
  await writeAuditLog({ userId: patient.id, userRole: 'patient', action: 'auth.login_success', entityType: 'patient', entityId: patient.id, ipAddress: req.ip || null }).catch(() => {})
  const syncedPatient = await syncPatientProfileStatus(patient)

  res.status(200).json({
    message: 'Login successful.',
    user: buildPatientAuthUser(syncedPatient),
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies.patient_token
  if (!token) return res.status(200).json({ authenticated: false })

  try {
    const decoded = await verifySessionToken(token, 'patient')

    const patient = await loadPatientById(decoded.id)
    if (!patient) return res.status(200).json({ authenticated: false })

    const syncedPatient = await syncPatientProfileStatus(patient)
    res.status(200).json({
      authenticated: true,
      user: buildPatientAuthUser(syncedPatient),
    })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = async (req, res) => {
  await writeAuditLog({ userId: req.user?.id || null, userRole: 'patient', action: 'auth.logout', entityType: 'patient', entityId: req.user?.id || null, ipAddress: req.ip || null }).catch(() => {})
  res.clearCookie('patient_token', { path: '/' })
  res.status(200).json({ message: 'Logged out.' })
}

const getProfileStatus = async (req, res) => {
  const patient = await loadPatientById(req.user.id)
  if (!patient) return res.status(404).json({ message: 'Patient account not found.' })

  const syncedPatient = await syncPatientProfileStatus(patient)
  res.json({
    profile: getProfileResponse(syncedPatient),
    is_profile_complete: Boolean(syncedPatient.is_profile_complete),
    missing_fields: syncedPatient.missing_fields,
  })
}

const updateProfile = async (req, res) => {
  const patient = await loadPatientById(req.user.id)
  if (!patient) return res.status(404).json({ message: 'Patient account not found.' })

  const normalized = normalizePatientProfileInput(req.body)
  const birthdateError = validateBirthdate(req.body?.birthdate)
  if (birthdateError) return res.status(400).json({ message: birthdateError })
  if (!normalized.birthdate || !normalized.gender || !normalized.address || !normalized.email) {
    return res.status(400).json({
      message: 'Birthdate, gender, address, and email are required.',
    })
  }

  if (normalized.email && String(normalized.email).toLowerCase() !== String(patient.email || '').toLowerCase()) {
    return res.status(409).json({
      code: 'EMAIL_CHANGE_VERIFICATION_REQUIRED',
      message: 'Email changes require a verified security flow. Your current verified email was kept unchanged.',
    })
  }

  if (normalized.email) {
    const [existingEmail] = await db.query(
      'SELECT id FROM patients WHERE email = ? AND id <> ?',
      [normalized.email, req.user.id]
    )
    if (existingEmail.length > 0) {
      return res.status(409).json({ message: 'That email address is already linked to another patient account.' })
    }
  }

  const receivePromotions = normalized.receive_promotions === undefined
    ? Boolean(patient.receive_promotions)
    : normalized.receive_promotions

  await db.query(
    `UPDATE patients
     SET birthdate = ?, gender = ?, sex = ?, civil_status = NULL, address = ?, email = ?, receive_promotions = ?
     WHERE id = ?`,
    [
      normalized.birthdate,
      normalized.gender,
      normalized.sex,
      normalized.address,
      normalized.email,
      receivePromotions ? 1 : 0,
      req.user.id,
    ]
  )

  const updatedPatient = await syncPatientProfileStatus(await loadPatientById(req.user.id))
  res.json({
    message: 'Profile updated.',
    user: buildPatientAuthUser(updatedPatient),
    profile: getProfileResponse(updatedPatient),
    is_profile_complete: Boolean(updatedPatient.is_profile_complete),
    missing_fields: updatedPatient.missing_fields,
  })
}

const getAppointments = async (req, res) => {
  await expirePendingAppointments().catch(() => {})
  const [rows] = await db.query(
    `SELECT
       a.*,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
       a.appointment_time AS time,
       a.clinic_type AS type,
       d.full_name AS doctor_name,
       d.full_name AS doctor,
       d.specialty,
       CASE a.clinic_type
         WHEN 'derma' THEN 'Dermatology'
         WHEN 'medical' THEN 'General Medicine'
         ELSE a.clinic_type
       END AS clinic,
       p.full_name AS patient_full_name,
       p.email AS patient_email,
       p.phone AS patient_phone,
       DATE_FORMAT(p.birthdate, '%Y-%m-%d') AS patient_birthdate,
       COALESCE(p.gender, p.sex) AS patient_sex,
       p.address AS patient_address,
       p.civil_status AS patient_civil_status
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     JOIN patients p ON a.patient_id = p.id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const getHistory = async (req, res) => {
  await expirePendingAppointments().catch(() => {})
  const [rows] = await db.query(
    `SELECT
       a.*,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS rawDate,
       a.appointment_time AS time,
       a.clinic_type AS type,
       d.full_name AS doctor_name,
       d.full_name AS doctor,
       d.specialty,
       CASE a.clinic_type
         WHEN 'derma' THEN 'Dermatology'
         WHEN 'medical' THEN 'General Medicine'
         ELSE a.clinic_type
       END AS clinic,
       c.id AS consultation_id,
       c.diagnosis,
       c.prescription,
       c.notes AS consultation_notes
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed', 'cancelled', 'no_show', 'rejected')
     ORDER BY a.appointment_date DESC`,
    [req.user.id]
  )
  const imagesByConsultationId = await loadImagesForConsultationIds(rows.map((row) => row.consultation_id))
  res.json(rows.map((row) => ({
    ...row,
    progress_images: imagesByConsultationId[row.consultation_id] || [],
  })))
}

const readBranchId = (req) => Number(req.body?.branch_id || req.query?.branch_id || 0)
const validatePatientBranch = async (req,res) => {
  const branchId=readBranchId(req)
  if(!Number.isSafeInteger(branchId)||branchId<=0){res.status(400).json({message:'Select a clinic branch before booking.'});return null}
  const [[branch]]=await db.query('SELECT id,name,offers_medical,offers_derma FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1',[branchId])
  if(!branch){res.status(404).json({message:'This clinic branch is not available.'});return null}
  return branch
}
const getBookingReadiness = async (req, res) => {
  const branch=await validatePatientBranch(req,res);if(!branch)return
  const readiness=await getOnlineBookingReadiness(db,branch.id)
  if(!branch.offers_medical)readiness.medical.bookable=false
  if(!branch.offers_derma)readiness.derma.bookable=false
  res.json(readiness)
}

const getBookingServices = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (clinicType && !['medical', 'derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Invalid clinic type.' })
  }
  const branch=await validatePatientBranch(req,res);if(!branch)return
  const visibleRows = await listBillingCatalog({ clinicType: clinicType || undefined, branchId: branch.id })
  res.json(visibleRows.map((service) => ({
    id: service.id,
    category: service.category,
    service_name: service.service_name,
    clinic_type: service.clinic_type,
    default_price: Number(service.default_price || 0),
    average_duration_minutes: Number(service.average_duration_minutes || 60),
    reserved_duration_minutes: roundReservedDurationMinutes(Number(service.average_duration_minutes || 60)),
  })))
}

const createAppointment = async (req, res) => {
  const { doctor_id, clinic_type, requested_service_id, reason, reason_details, appointment_date, appointment_time, notes } = req.body
  const branch=await validatePatientBranch(req,res);if(!branch)return
  if ((clinic_type === 'medical' && !branch.offers_medical) || (clinic_type === 'derma' && !branch.offers_derma)) return res.status(409).json({message:'This branch does not offer the selected clinic type.'})
  const [[assignedDoctor]]=await db.query('SELECT id FROM doctors WHERE id=? AND is_active=1 AND branch_id=? AND clinic_type=?',[doctor_id,branch.id,clinic_type])
  if(!assignedDoctor)return res.status(409).json({message:'The selected doctor does not work at this branch.'})
  if (!doctor_id || !clinic_type || !requested_service_id || !appointment_date || !appointment_time) {
    return res.status(400).json({ message: 'Missing required fields.' })
  }

  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate)) {
    return res.status(400).json({ message: 'Invalid appointment date.' })
  }
  if (normalizedDate < getTodayDateOnly()) {
    return res.status(400).json({ message: 'Cannot create an appointment in the past.' })
  }


  const patient = await loadPatientById(req.user.id)
  if (!patient) return res.status(404).json({ message: 'Patient account not found.' })
  const profileStatus = await syncPatientProfileStatus(patient)
  if (!profileStatus.is_profile_complete) {
    return res.status(428).json({ code: 'PROFILE_REQUIRED', message: 'Complete your patient profile before booking an appointment.' })
  }

  const [serviceRows] = await db.query(
    `SELECT id, service_name, clinic_type, default_price, average_duration_minutes, is_active
     FROM billing_service_catalog
     WHERE id = ? AND branch_id = ? LIMIT 1`,
    [requested_service_id, branch.id]
  )
  const requestedService = serviceRows[0]
  if (!requestedService || Number(requestedService.is_active) !== 1) {
    return res.status(409).json({ message: 'The selected service is no longer available. Please choose another service.' })
  }
  if (![clinic_type, 'all'].includes(String(requestedService.clinic_type || ''))) {
    return res.status(409).json({ message: 'The selected service does not belong to this clinic.' })
  }

  const selectedReason = normalizeText(reason, { field: 'Reason for visit', required: true, max: 120 })
  let storedReason = selectedReason
  if (isOtherVisitReason(selectedReason)) {
    const details = normalizeText(reason_details, { field: 'Other reason explanation', required: true, min: 2, max: 180, multiline: true })
    storedReason = `Other — ${details}`
  } else {
    const [reasonRows] = await db.query(
      `SELECT id, label
       FROM appointment_reason_options
       WHERE is_active = 1
         AND LOWER(TRIM(label)) = LOWER(?)
         AND (clinic_type = ? OR clinic_type = 'all') AND branch_id = ?
       LIMIT 1`,
      [selectedReason, clinic_type, branch.id]
    )
    if (!reasonRows.length) {
      return res.status(409).json({ code: 'VISIT_REASON_UNAVAILABLE', message: 'The selected reason for visit is no longer available. Please choose another reason.' })
    }
    storedReason = reasonRows[0].label
  }

  const [activeWithDoctor] = await db.query(
    `SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ?
     AND status IN ('pending', 'confirmed', 'rescheduled', 'in-progress') LIMIT 1`,
    [req.user.id, doctor_id]
  )
  if (activeWithDoctor.length) return res.status(409).json({ message: 'You already have an active appointment with this doctor. Please wait for completion or cancel it first.' })

  const bookingSettings = await loadBookingSettings(db,branch.id)
  const averageDurationMinutes = Number(requestedService.average_duration_minutes || 60)
  const reservedDurationMinutes = roundReservedDurationMinutes(averageDurationMinutes, bookingSettings.booking_start_interval_minutes)
  const confirmationDeadline = buildConfirmationDeadlineSql({
    date: normalizedDate,
    time: appointment_time,
    cutoffMinutes: bookingSettings.pending_confirmation_cutoff_minutes,
  })

  const result = await withAppointmentSlotLock({ doctorId: doctor_id }, async () => {
    await validateAppointmentSlot({
      doctorId: doctor_id,
      clinicType: clinic_type,
      date: normalizedDate,
      time: appointment_time,
      durationMinutes: reservedDurationMinutes,
      startIntervalMinutes: bookingSettings.booking_start_interval_minutes,
      enforceLeadTime: true,
      minLeadMinutes: bookingSettings.online_min_lead_minutes,
    })
    const [inserted] = await db.query(
      `INSERT INTO appointments
       (patient_id, doctor_id, clinic_type, requested_service_id, requested_service_name_snapshot, requested_service_price_snapshot,
        requested_service_duration_minutes_snapshot, reserved_duration_minutes_snapshot, confirmation_deadline_at,
        reason, appointment_date, appointment_time, notes, appointment_source, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', ?)`,
      [req.user.id, doctor_id, clinic_type, requestedService.id, requestedService.service_name, requestedService.default_price,
       averageDurationMinutes, reservedDurationMinutes, confirmationDeadline,
       storedReason, normalizedDate, appointment_time, notes || null, branch.id]
    )
    return inserted
  })

  const [details] = await db.query(
    `SELECT
       a.id,
       p.full_name AS patient_name,
       d.id AS doctor_id,
       d.full_name AS doctor_name,
       d.phone AS doctor_phone
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [result.insertId]
  )

  const appointment = details[0]
  await notifyRoles(['admin', 'staff'], {
    type: 'appointment_booked',
    title: 'New patient booking',
    message: `${appointment.patient_name} booked an appointment with ${appointment.doctor_name} on ${normalizedDate} at ${appointment_time}.`,
    reference_type: 'appointment',
    reference_id: result.insertId,
  })

  await createNotification({
    target_role: 'patient',
    target_user_id: req.user.id,
    type: 'appointment_booked',
    title: 'Appointment received',
    message: `Your appointment request for ${normalizedDate} at ${appointment_time} is pending confirmation.`,
    reference_type: 'appointment',
    reference_id: result.insertId,
  })

  await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'appointment.created', entityType: 'appointment', entityId: result.insertId, newValues: { doctor_id: Number(doctor_id), clinic_type, requested_service_id: Number(requestedService.id), requested_service_name: requestedService.service_name, appointment_date: normalizedDate, appointment_time, appointment_source: 'online' }, ipAddress: req.ip || null }).catch(() => {})
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', {
    appointmentId: result.insertId,
    status: 'pending',
  })

  res.status(201).json({ message: 'Appointment booked.', id: result.insertId })
}

const cancelAppointment = async (req, res) => {
  const [[ownedAppointment]] = await db.query('SELECT branch_id FROM appointments WHERE id=? AND patient_id=?', [req.params.id,req.user.id])
  if(!ownedAppointment) return res.status(404).json({message:'Appointment not found.'})
  const cancellation = await resolveCancellationInput(req.body,db,ownedAppointment.branch_id)
  const [rows] = await db.query(
    'SELECT id, status, doctor_id, appointment_date, appointment_time FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed', 'rescheduled'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending, confirmed, or rescheduled appointments can be cancelled.' })
  }

  assertAppointmentTransition(rows[0].status, 'cancelled')
  const [updated] = await db.query(
    `UPDATE appointments
     SET status = 'cancelled', cancellation_reason_id = ?, cancellation_reason_snapshot = ?,
         cancellation_details = ?, cancelled_by_role = 'patient', cancelled_by_user_id = ?, cancelled_at = NOW()
     WHERE id = ? AND patient_id = ? AND status = ?`,
    [cancellation.cancellation_reason_id, cancellation.cancellation_reason_snapshot, cancellation.cancellation_details, req.user.id, req.params.id, req.user.id, rows[0].status]
  )
  await assertAppointmentMutationApplied(updated, req.params.id)
  await writeAuditLog({
    userId: req.user.id,
    userRole: 'patient',
    action: 'appointment.cancelled',
    entityType: 'appointment',
    entityId: req.params.id,
    oldValues: { status: rows[0].status },
    newValues: { status: 'cancelled', ...cancellation },
    ipAddress: req.ip || null,
  }).catch(() => {})
  await createNotification({
    target_role: 'patient',
    target_user_id: req.user.id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    message: `Your appointment has been cancelled. Reason: ${cancellation.cancellation_reason_snapshot}.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await notifyRoles(['admin', 'staff'], {
    type: 'appointment_cancelled',
    title: 'Patient cancelled appointment',
    message: `Appointment #${req.params.id} was cancelled by the patient. Reason: ${cancellation.cancellation_reason_snapshot}.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`, `patient_${req.user.id}`], 'appointment_updated', {
    appointmentId: Number(req.params.id),
    status: 'cancelled',
  })
  res.json({ message: 'Appointment cancelled.', cancellation })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time, notes } = req.body
  if (!appointment_date || !appointment_time) return res.status(400).json({ message: 'Date and time required.' })

  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate)) return res.status(400).json({ message: 'Invalid appointment date.' })
  if (normalizedDate < getTodayDateOnly()) return res.status(400).json({ message: 'Cannot reschedule to a past date.' })

  const [rows] = await db.query(
    `SELECT id, doctor_id, status, clinic_type, branch_id,
            requested_service_duration_minutes_snapshot, reserved_duration_minutes_snapshot
     FROM appointments WHERE id = ? AND patient_id = ?`,
    [req.params.id, req.user.id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be rescheduled.' })
  }

  const settings = await loadBookingSettings(db,rows[0].branch_id)
  const durationMinutes = getAppointmentReservedDuration(rows[0])
  const confirmationDeadline = buildConfirmationDeadlineSql({
    date: normalizedDate,
    time: appointment_time,
    cutoffMinutes: settings.pending_confirmation_cutoff_minutes,
  })

  assertAppointmentTransition(rows[0].status, 'rescheduled')
  await withAppointmentSlotLock({ doctorId: rows[0].doctor_id }, async () => {
    await validateAppointmentSlot({
      doctorId: rows[0].doctor_id,
      clinicType: rows[0].clinic_type,
      date: normalizedDate,
      time: appointment_time,
      durationMinutes,
      startIntervalMinutes: settings.booking_start_interval_minutes,
      excludeAppointmentId: req.params.id,
      enforceLeadTime: true,
      minLeadMinutes: settings.online_min_lead_minutes,
    })
    const [updated] = await db.query(
      `UPDATE appointments
       SET appointment_date = ?, appointment_time = ?, status = 'pending',
           confirmation_deadline_at = ?, rejected_at = NULL, rejected_by_role = NULL, rejection_reason = NULL,
           notes = COALESCE(?, notes)
       WHERE id = ? AND patient_id = ? AND status = ?`,
      [normalizedDate, appointment_time, confirmationDeadline, notes?.trim() || null, req.params.id, req.user.id, rows[0].status]
    )
    await assertAppointmentMutationApplied(updated, req.params.id)
  })

  const [details] = await db.query(
    `SELECT a.id, p.email AS patient_email, p.full_name AS patient_name, d.full_name AS doctor_name, a.clinic_type
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (!details.length) return res.status(404).json({ message: 'Appointment not found.' })

  if (details[0].patient_email) {
    await sendAppointmentStatusEmail({
      to: details[0].patient_email,
      patient_name: details[0].patient_name,
      doctor_name: details[0].doctor_name,
      appointment_date: normalizedDate,
      appointment_time,
      clinic_type: details[0].clinic_type,
      status: 'rescheduled',
    }).catch(() => {})
  }

  await notifyRoles(['admin', 'staff'], {
    type: 'appointment_reschedule_request',
    title: 'Appointment needs reconfirmation',
    message: `${details[0].patient_name} moved an appointment with ${details[0].doctor_name} to ${normalizedDate} at ${appointment_time}.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await createNotification({
    target_role: 'patient', target_user_id: req.user.id, type: 'appointment_rescheduled', title: 'Reschedule submitted',
    message: `Your new schedule (${normalizedDate} at ${appointment_time}) is pending confirmation.`,
    reference_type: 'appointment', reference_id: req.params.id,
  })
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'pending' })
  await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'appointment.rescheduled', entityType: 'appointment', entityId: req.params.id, newValues: { appointment_date: normalizedDate, appointment_time, status: 'pending', confirmation_deadline_at: confirmationDeadline }, ipAddress: req.ip || null }).catch(() => {})
  res.json({ message: 'Appointment rescheduled and returned to pending confirmation.' })
}

const getAppointmentCancellationReasons = async (req, res) => {
  const branchId = Number(req.query.branch_id)
  if(!Number.isSafeInteger(branchId)||branchId<=0) return res.status(400).json({message:'Choose an appointment branch to see cancellation reasons.'})
  res.json(await listCancellationReasons({ activeOnly: true, branchId }))
}

const getDoctors = async (req, res) => {
  const branch=await validatePatientBranch(req,res);if(!branch)return
  const [rows] = await db.query(
    'SELECT id, full_name AS name, full_name, specialty, clinic_type FROM doctors WHERE is_active = 1 AND branch_id=? ORDER BY full_name',[branch.id]
  )
  res.json(rows)
}

const getAppointmentReasons = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (clinicType && !['medical', 'derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Invalid clinic type.' })
  }
  const branch=await validatePatientBranch(req,res);if(!branch)return
  const params = [branch.id]
  let sql = `
    SELECT id, label, clinic_type, is_active, sort_order
    FROM appointment_reason_options
    WHERE is_active = 1 AND branch_id=?
  `

  if (clinicType) {
    sql += ' AND (clinic_type = ? OR clinic_type = "all")'
    params.push(clinicType)
  }

  sql += ' ORDER BY label ASC'

  const [rows] = await db.query(sql, params)
  res.json(withSystemOtherVisitReason(rows))
}

const getDoctorsAvailability = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (clinicType && !['medical','derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Invalid clinic type.' })
  }
  const branch=await validatePatientBranch(req,res);if(!branch)return
  const result = await buildDoctorAvailabilitySummary({
    branchId:branch.id,
    clinicType,
    startDate: String(req.query.start_date || '').trim() || undefined,
    days: Math.min(14, Math.max(1, Number(req.query.days) || 7)),
  })
  res.json(result)
}

const requirePatientBranchDoctor = async (req, res) => {
  const branchId = Number(req.query?.branch_id)
  if (!Number.isSafeInteger(branchId) || branchId <= 0) {
    res.status(400).json({ message: 'Please select a clinic branch.' })
    return null
  }
  const [[doctor]] = await db.query(
    `SELECT d.id FROM doctors d
     JOIN clinic_branches b ON b.id = d.branch_id AND b.is_active = 1
     WHERE d.id = ? AND d.branch_id = ? AND d.is_active = 1 LIMIT 1`,
    [req.params.id, branchId]
  )
  if (!doctor) {
    res.status(404).json({ message: 'Doctor not available at the selected branch.' })
    return null
  }
  return branchId
}

const getDoctorSchedule = async (req, res) => {
  if (!await requirePatientBranchDoctor(req, res)) return
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1',
    [req.params.id]
  )
  res.json(rows)
}

const getDoctorUnavailableDatesController = async (req, res) => {
  if (!await requirePatientBranchDoctor(req, res)) return
  const rows = await getDoctorUnavailableDates(req.params.id, {
    startDate: String(req.query.start_date || '').trim() || undefined,
    endDate: String(req.query.end_date || '').trim() || undefined,
  })
  res.json(rows)
}

const getDoctorAvailableSlots = async (req, res) => {
  const normalizedDate = toDateOnly(req.query.date)
  if (!isValidDateOnly(normalizedDate)) return res.status(400).json({ message: 'A valid date is required.' })
  const clinicTypeInput = String(req.query.clinic_type || '').trim()
  const serviceId = Number(req.query.service_id)
  const appointmentId = Number(req.query.appointment_id)
  let branchId=readBranchId(req)
  if(appointmentId>0){const [[previous]]=await db.query('SELECT branch_id FROM appointments WHERE id=? AND patient_id=?',[appointmentId,req.user.id]);if(previous)branchId=Number(previous.branch_id)}
  const [[assigned]]=await db.query('SELECT id FROM doctors WHERE id=? AND branch_id=? AND is_active=1',[req.params.id,branchId])
  if(!assigned)return res.status(404).json({message:'This doctor is not available at the selected branch.'})
  const settings = await loadBookingSettings(db,branchId)
  let clinicType = clinicTypeInput
  let averageDurationMinutes = 60
  let reservedDurationMinutes = 60
  let excludeAppointmentId = null

  if (appointmentId > 0) {
    const [[appointment]] = await db.query(
      `SELECT doctor_id, clinic_type, requested_service_duration_minutes_snapshot, reserved_duration_minutes_snapshot
       FROM appointments WHERE id = ? AND patient_id = ? LIMIT 1`,
      [appointmentId, req.user.id]
    )
    if (!appointment || Number(appointment.doctor_id) !== Number(req.params.id)) {
      return res.status(404).json({ message: 'Appointment not found for this doctor.' })
    }
    clinicType = appointment.clinic_type
    averageDurationMinutes = Number(appointment.requested_service_duration_minutes_snapshot || 60)
    reservedDurationMinutes = getAppointmentReservedDuration(appointment)
    excludeAppointmentId = appointmentId
  } else {
    if (!['medical', 'derma'].includes(clinicType) || !serviceId) {
      return res.status(400).json({ message: 'Clinic and service are required to load available times.' })
    }
    const [[service]] = await db.query(
      `SELECT id, clinic_type, average_duration_minutes, is_active
       FROM billing_service_catalog WHERE id = ? AND branch_id=? LIMIT 1`,
      [serviceId,branchId]
    )
    if (!service || Number(service.is_active) !== 1 || ![clinicType, 'all'].includes(String(service.clinic_type || ''))) {
      return res.status(409).json({ message: 'The selected service is no longer available for this clinic.' })
    }
    averageDurationMinutes = Number(service.average_duration_minutes || 60)
    reservedDurationMinutes = roundReservedDurationMinutes(averageDurationMinutes, settings.booking_start_interval_minutes)
  }

  const slots = await getAvailableAppointmentSlots({
    doctorId: req.params.id,
    clinicType,
    date: normalizedDate,
    durationMinutes: reservedDurationMinutes,
    startIntervalMinutes: settings.booking_start_interval_minutes,
    excludeAppointmentId,
    enforceLeadTime: true,
    minLeadMinutes: settings.online_min_lead_minutes,
  })
  res.json({
    slots,
    average_duration_minutes: averageDurationMinutes,
    reserved_duration_minutes: reservedDurationMinutes,
    booking_start_interval_minutes: settings.booking_start_interval_minutes,
    online_min_lead_minutes: settings.online_min_lead_minutes,
  })
}

const getDoctorTakenSlots = async (req, res) => {
  if (!await requirePatientBranchDoctor(req, res)) return
  const normalizedDate = toDateOnly(req.query.date)
  if (!isValidDateOnly(normalizedDate)) {
    return res.status(400).json({ message: 'A valid date is required.' })
  }

  const blockedDate = await getDoctorUnavailableDate(req.params.id, normalizedDate)
  if (blockedDate) {
    return res.json([])
  }

  const excludeAppointmentId = Number(req.query.exclude_appointment_id)
  const params = [req.params.id, normalizedDate]
  let sql = `
    SELECT appointment_time
    FROM appointments
    WHERE doctor_id = ? AND appointment_date = ?
      AND status IN ('pending', 'confirmed', 'rescheduled', 'in-progress')
  `

  if (Number.isInteger(excludeAppointmentId) && excludeAppointmentId > 0) {
    const [[owned]] = await db.query(
      'SELECT id FROM appointments WHERE id=? AND patient_id=? AND doctor_id=? AND branch_id=?',
      [excludeAppointmentId, req.user.id, req.params.id, Number(req.query.branch_id)]
    )
    if (!owned) return res.status(404).json({ message: 'Appointment not found.' })
    sql += ' AND id != ?'
    params.push(excludeAppointmentId)
  }

  sql += ' ORDER BY appointment_time ASC'

  const [rows] = await db.query(sql, params)
  res.json(rows.map((row) => row.appointment_time))
}

module.exports = {
  register,
  verifyRegistration,
  resendRegistrationVerification,
  login,
  checkAuth,
  logout,
  getProfileStatus,
  updateProfile,
  getAppointments,
  getHistory,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAppointmentReasons,
  getAppointmentCancellationReasons,
  getBookingReadiness,
  getBookingServices,
  getDoctors,
  getDoctorsAvailability,
  getDoctorSchedule,
  getDoctorUnavailableDatesController,
  getDoctorAvailableSlots,
  getDoctorTakenSlots,
}


