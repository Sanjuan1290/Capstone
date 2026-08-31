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
} = require('../utils/patientProfile')
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition } = require('../utils/appointmentSecurity')
const { writeAuditLog } = require('../utils/audit')

const OTP_EXPIRY_MS = 10 * 60 * 1000
const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

const buildPatientAuthUser = (patient) => ({
  id: patient.id,
  full_name: patient.full_name,
  email: patient.email,
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
  civil_status: patient.civil_status,
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
  const {
    full_name,
    phone,
    password,
    confirmPassword,
    consent_given,
    receive_promotions,
  } = req.body

  if (!full_name || !phone || !password) {
    return res.status(400).json({ message: 'Full name, phone number, and password are required.' })
  }

  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone) {
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.' })
  }

  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ message: passwordError })

  if (!consent_given) {
    return res.status(400).json({ message: 'Data privacy consent is required.' })
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

  const hashedPassword = await bcrypt.hash(password, 10)
  const code = makeNumericCode()
  const payload = JSON.stringify({
    full_name: String(full_name).trim(),
    phone: normalizedPhone,
    password: hashedPassword,
    consent_given: true,
    receive_promotions: receive_promotions ? 1 : 0,
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
      fullName: full_name,
    })
  } catch (err) {
    console.error('Patient registration OTP SMS failed:', {
      message: err.message,
      statusCode: err.statusCode,
      responseBody: err.responseBody,
    })

    return res.status(502).json({
      message: 'Failed to send verification code by SMS. Please try again later.',
    })
  }

  res.status(200).json({
    message: 'Verification code sent by SMS.',
    phone: normalizedPhone,
  })
}

const verifyRegistration = async (req, res) => {
  const normalizedPhone = normalizePhilippinePhone(req.body.phone)
  const code = String(req.body.code || '').trim()

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
       SET full_name = ?, phone = ?, password = ?, consent_given = ?, consent_given_at = ?, receive_promotions = ?
       WHERE id = ?`,
      [
        payload.full_name,
        normalizedPhone,
        payload.password,
        payload.consent_given ? 1 : 0,
        payload.consent_given ? new Date() : null,
        payload.receive_promotions ? 1 : 0,
        existing[0].id,
      ]
    )
    patientId = existing[0].id
  } else {
    const [result] = await db.query(
      `INSERT INTO patients
        (full_name, birthdate, gender, sex, civil_status, phone, address, email, password, consent_given, consent_given_at, receive_promotions, is_profile_complete)
       VALUES (?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, 0)`,
      [
        payload.full_name,
        normalizedPhone,
        payload.password,
        payload.consent_given ? 1 : 0,
        payload.consent_given ? new Date() : null,
        payload.receive_promotions ? 1 : 0,
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
    return res.status(400).json({ message: 'Phone number and password are required.' })
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
    ;[rows] = await db.query('SELECT * FROM patients WHERE email = ?', [email])
  }

  if (rows.length === 0) {
    await writeAuditLog({ userRole: 'patient', action: 'auth.login_failed', entityType: 'patient', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid phone number or password.' })
  }

  const patient = rows[0]
  const match = await bcrypt.compare(password, patient.password)
  if (!match) {
    await writeAuditLog({ userId: patient.id, userRole: 'patient', action: 'auth.login_failed', entityType: 'patient', entityId: patient.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid phone number or password.' })
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
  if (!normalized.birthdate || !normalized.gender || !normalized.address) {
    return res.status(400).json({
      message: 'Birthdate, gender, and address are required to complete your patient profile.',
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
     SET birthdate = ?, gender = ?, sex = ?, civil_status = ?, address = ?, email = ?, receive_promotions = ?
     WHERE id = ?`,
    [
      normalized.birthdate,
      normalized.gender,
      normalized.sex,
      normalized.civil_status,
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
  await markOverdueAppointments()
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
  await markOverdueAppointments()
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
     WHERE a.patient_id = ? AND a.status IN ('completed', 'cancelled', 'no_show')
     ORDER BY a.appointment_date DESC`,
    [req.user.id]
  )
  const imagesByConsultationId = await loadImagesForConsultationIds(rows.map((row) => row.consultation_id))
  res.json(rows.map((row) => ({
    ...row,
    progress_images: imagesByConsultationId[row.consultation_id] || [],
  })))
}

const createAppointment = async (req, res) => {
  const { doctor_id, clinic_type, reason, appointment_date, appointment_time, notes } = req.body
  if (!doctor_id || !clinic_type || !appointment_date || !appointment_time) {
    return res.status(400).json({ message: 'Missing required fields.' })
  }

  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate)) {
    return res.status(400).json({ message: 'Invalid appointment date.' })
  }
  if (normalizedDate < getTodayDateOnly()) {
    return res.status(400).json({ message: 'Cannot create an appointment in the past.' })
  }

  await markOverdueAppointments()

  const patient = await loadPatientById(req.user.id)
  if (!patient) return res.status(404).json({ message: 'Patient account not found.' })
  const profileStatus = await syncPatientProfileStatus(patient)
  if (!profileStatus.is_profile_complete) {
    return res.status(428).json({ code: 'PROFILE_REQUIRED', message: 'Complete your patient profile before booking an appointment.' })
  }

  const [activeWithDoctor] = await db.query(
    `SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ?
     AND status IN ('pending', 'confirmed', 'rescheduled', 'in-progress') LIMIT 1`,
    [req.user.id, doctor_id]
  )
  if (activeWithDoctor.length) return res.status(409).json({ message: 'You already have an active appointment with this doctor. Please wait for completion or cancel it first.' })

  const result = await withAppointmentSlotLock({ doctorId: doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: doctor_id, clinicType: clinic_type, date: normalizedDate, time: appointment_time })
    const [inserted] = await db.query(
      `INSERT INTO appointments
       (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, doctor_id, clinic_type, reason, normalizedDate, appointment_time, notes || null]
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

  await createNotification({
    target_role: 'doctor',
    target_user_id: appointment.doctor_id,
    type: 'appointment_booked',
    title: 'New appointment booked',
    message: `${appointment.patient_name} booked an appointment on ${normalizedDate} at ${appointment_time}.`,
    reference_type: 'appointment',
    reference_id: result.insertId,
  })

  await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'appointment.created', entityType: 'appointment', entityId: result.insertId, newValues: { doctor_id: Number(doctor_id), clinic_type, appointment_date: normalizedDate, appointment_time, appointment_source: 'online' }, ipAddress: req.ip || null }).catch(() => {})
  broadcast(['admin', 'staff', `doctor_${appointment.doctor_id}`, `patient_${req.user.id}`], 'appointment_updated', {
    appointmentId: result.insertId,
    status: 'pending',
  })

  res.status(201).json({ message: 'Appointment booked.', id: result.insertId })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, status FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be cancelled.' })
  }

  assertAppointmentTransition(rows[0].status, 'cancelled')
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'appointment.cancelled', entityType: 'appointment', entityId: req.params.id, oldValues: { status: rows[0].status }, newValues: { status: 'cancelled' }, ipAddress: req.ip || null }).catch(() => {})
  await createNotification({
    target_role: 'patient',
    target_user_id: req.user.id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    message: 'Your appointment has been cancelled.',
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', {
    appointmentId: Number(req.params.id),
    status: 'cancelled',
  })
  res.json({ message: 'Appointment cancelled.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time, notes } = req.body
  if (!appointment_date || !appointment_time) {
    return res.status(400).json({ message: 'Date and time required.' })
  }

  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate)) {
    return res.status(400).json({ message: 'Invalid appointment date.' })
  }
  if (normalizedDate < getTodayDateOnly()) {
    return res.status(400).json({ message: 'Cannot reschedule to a past date.' })
  }

  await markOverdueAppointments()
  const [rows] = await db.query(
    'SELECT id, doctor_id, status FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be rescheduled.' })
  }

  assertAppointmentTransition(rows[0].status, 'rescheduled')
  await withAppointmentSlotLock({ doctorId: rows[0].doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    const [[appointmentMeta]] = await db.query('SELECT clinic_type FROM appointments WHERE id = ? LIMIT 1', [req.params.id])
    await validateAppointmentSlot({ doctorId: rows[0].doctor_id, clinicType: appointmentMeta.clinic_type, date: normalizedDate, time: appointment_time, excludeAppointmentId: req.params.id })
    await db.query(
      `UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = 'pending', notes = COALESCE(?, notes) WHERE id = ?`,
      [normalizedDate, appointment_time, notes?.trim() || null, req.params.id]
    )
  })

  const [details] = await db.query(
    `SELECT a.id, p.email AS patient_email, p.full_name AS patient_name, d.full_name AS doctor_name, a.clinic_type
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )

  if (details.length === 0) {
    return res.status(404).json({ message: 'Appointment not found.' })
  }

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
    target_role: 'patient',
    target_user_id: req.user.id,
    type: 'appointment_rescheduled',
    title: 'Reschedule submitted',
    message: `Your new schedule (${normalizedDate} at ${appointment_time}) is pending confirmation.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })

  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', {
    appointmentId: Number(req.params.id),
    status: 'pending',
  })

  await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'appointment.rescheduled', entityType: 'appointment', entityId: req.params.id, newValues: { appointment_date: normalizedDate, appointment_time, status: 'pending' }, ipAddress: req.ip || null }).catch(() => {})
  res.json({ message: 'Appointment rescheduled and returned to pending confirmation.' })
}

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name AS name, full_name, specialty FROM doctors WHERE is_active = 1 ORDER BY full_name'
  )
  res.json(rows)
}

const getAppointmentReasons = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  const params = []
  let sql = `
    SELECT id, label, clinic_type, is_active, sort_order
    FROM appointment_reason_options
    WHERE is_active = 1
  `

  if (clinicType) {
    sql += ' AND (clinic_type = ? OR clinic_type = "all")'
    params.push(clinicType)
  }

  sql += ' ORDER BY label ASC'

  const [rows] = await db.query(sql, params)
  res.json(rows)
}

const getDoctorsAvailability = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (clinicType && !['medical','derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Invalid clinic type.' })
  }
  const result = await buildDoctorAvailabilitySummary({
    clinicType,
    startDate: String(req.query.start_date || '').trim() || undefined,
    days: Math.min(14, Math.max(1, Number(req.query.days) || 7)),
  })
  res.json(result)
}

const getDoctorSchedule = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1',
    [req.params.id]
  )
  res.json(rows)
}

const getDoctorUnavailableDatesController = async (req, res) => {
  const rows = await getDoctorUnavailableDates(req.params.id, {
    startDate: String(req.query.start_date || '').trim() || undefined,
    endDate: String(req.query.end_date || '').trim() || undefined,
  })
  res.json(rows)
}

const getDoctorTakenSlots = async (req, res) => {
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
  getDoctors,
  getDoctorsAvailability,
  getDoctorSchedule,
  getDoctorUnavailableDatesController,
  getDoctorTakenSlots,
}
