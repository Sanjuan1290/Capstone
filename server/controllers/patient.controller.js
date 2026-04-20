// server/controllers/patient.controller.js

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendVerificationCode, sendAppointmentStatusEmail } = require('../utils/emailService')
const { notifyRoles, createNotification } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly } = require('../utils/date')

// In-memory pending registrations (keyed by email)
const pendingRegistrations = {}

const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const getAgeFromBirthdate = (birthdate) => {
  const birth = new Date(`${birthdate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

// ─── Registration ─────────────────────────────────────────────────────────────

const register = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, password, confirmPassword, consent_given } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address || !email || !password)
    return res.status(400).json({ message: 'All required fields must be filled.' })
  const cleanBirthdate = toDateOnly(birthdate)
  if (!isValidDateOnly(cleanBirthdate))
    return res.status(400).json({ message: 'Birthdate is invalid.' })
  const age = getAgeFromBirthdate(cleanBirthdate)
  if (age === null || age < 21)
    return res.status(400).json({ message: 'You must be at least 21 years old to register an account.' })

  if (password !== confirmPassword)
    return res.status(400).json({ message: 'Passwords do not match.' })

  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })
  if (!consent_given)
    return res.status(400).json({ message: 'Data privacy consent is required.' })

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'An account with that email already exists.' })

  const hashed = await bcrypt.hash(password, 10)
  const code   = String(Math.floor(100000 + Math.random() * 900000))

  pendingRegistrations[email] = {
    full_name, birthdate: cleanBirthdate, sex, civil_status: civil_status || null,
    phone, address, email, password: hashed,
    consent_given: true,
    code, expiresAt: Date.now() + 10 * 60 * 1000,
  }

  try {
    await sendVerificationCode(email, full_name, code)
  } catch (err) {
    console.error('⚠️  Verification email failed:', err.message)
  }

  res.status(200).json({ message: 'Verification code sent. Please check your email.' })
}

const verifyRegistration = async (req, res) => {
  const { email, code } = req.body

  const pending = pendingRegistrations[email]
  if (!pending)
    return res.status(400).json({ message: 'No pending registration found for this email.' })

  if (Date.now() > pending.expiresAt) {
    delete pendingRegistrations[email]
    return res.status(400).json({ message: 'Verification code has expired. Please register again.' })
  }

  if (String(pending.code) !== String(code))
    return res.status(400).json({ message: 'Invalid verification code.' })

  const [result] = await db.query(
    `INSERT INTO patients
      (full_name, birthdate, sex, civil_status, phone, address, email, password, consent_given, consent_given_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pending.full_name, pending.birthdate, pending.sex, pending.civil_status, pending.phone, pending.address, pending.email, pending.password, pending.consent_given ? 1 : 0, pending.consent_given ? new Date() : null]
  )

  if (pending.consent_given) {
    await db.query(
      'INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)',
      [result.insertId, 'data_processing', req.ip || null]
    )
  }

  delete pendingRegistrations[email]

  const token = jwt.sign({ id: result.insertId, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'patient')

  res.status(201).json({
    message: 'Registration successful.',
    user: { id: result.insertId, full_name: pending.full_name, email: pending.email, role: 'patient' },
  })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query('SELECT * FROM patients WHERE email = ?', [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const patient = rows[0]
  const match   = await bcrypt.compare(password, patient.password)
  if (!match)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const token = jwt.sign({ id: patient.id, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'patient')

  res.status(200).json({
    message: 'Login successful.',
    user: { id: patient.id, full_name: patient.full_name, email: patient.email, role: 'patient', theme_preference: patient.theme_preference, profile_image_url: patient.profile_image_url },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['patient_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'patient') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query('SELECT id, full_name, email, theme_preference, profile_image_url FROM patients WHERE id = ?', [decoded.id])
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'patient' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('patient_token')
  res.status(200).json({ message: 'Logged out.' })
}

// ─── Appointments ─────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  await markOverdueAppointments()
  const [rows] = await db.query(
    // ✅ FIX: include full patient details + properly formatted date
    `SELECT
       a.*,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
       a.appointment_time                           AS time,
       a.clinic_type                                AS type,
       d.full_name                                  AS doctor_name,
       d.full_name                                  AS doctor,
       d.specialty,
       CASE a.clinic_type
         WHEN 'derma'   THEN 'Dermatology'
         WHEN 'medical' THEN 'General Medicine'
         ELSE a.clinic_type
       END                                          AS clinic,
       p.full_name                                  AS patient_full_name,
       p.email                                      AS patient_email,
       p.phone                                      AS patient_phone,
       DATE_FORMAT(p.birthdate, '%Y-%m-%d')         AS patient_birthdate,
       p.sex                                        AS patient_sex,
       p.address                                    AS patient_address,
       p.civil_status                               AS patient_civil_status
     FROM appointments a
     JOIN doctors  d ON a.doctor_id  = d.id
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
       a.appointment_time                           AS time,
       a.clinic_type                                AS type,
       d.full_name                                  AS doctor_name,
       d.full_name                                  AS doctor,
       d.specialty,
       CASE a.clinic_type
         WHEN 'derma'   THEN 'Dermatology'
         WHEN 'medical' THEN 'General Medicine'
         ELSE a.clinic_type
       END                                          AS clinic,
       c.diagnosis,
       c.prescription,
       c.notes                                      AS consultation_notes
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled','no_show')
     ORDER BY a.appointment_date DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const createAppointment = async (req, res) => {
  const { doctor_id, clinic_type, reason, appointment_date, appointment_time, notes } = req.body
  if (!doctor_id || !clinic_type || !appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Missing required fields.' })
  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate))
    return res.status(400).json({ message: 'Invalid appointment date.' })
  if (normalizedDate < getTodayDateOnly())
    return res.status(400).json({ message: 'Cannot create an appointment in the past.' })
  await markOverdueAppointments()

  const [activeWithDoctor] = await db.query(
    `SELECT id
     FROM appointments
     WHERE patient_id = ? AND doctor_id = ?
       AND status IN ('pending','confirmed','rescheduled','in-progress')
     LIMIT 1`,
    [req.user.id, doctor_id]
  )
  if (activeWithDoctor.length > 0) {
    return res.status(409).json({
      message: 'You already have an active appointment with this doctor. Please wait for completion or cancel it first.',
    })
  }

  const [existing] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status IN ('pending','confirmed','rescheduled','in-progress')`,
    [doctor_id, normalizedDate, appointment_time]
  )
  if (existing.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, doctor_id, clinic_type, reason, normalizedDate, appointment_time, notes || null]
  )

  const [details] = await db.query(
    `SELECT a.id, p.full_name AS patient_name, d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [result.insertId]
  )

  const appt = details[0]
  await notifyRoles(['admin', 'staff'], {
    type: 'appointment_booked',
    title: 'New patient booking',
    message: `${appt.patient_name} booked an appointment with ${appt.doctor_name} on ${normalizedDate} at ${appointment_time}.`,
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
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', { appointmentId: result.insertId, status: 'pending' })

  res.status(201).json({ message: 'Appointment booked.', id: result.insertId })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, status FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed'].includes(rows[0].status))
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be cancelled.' })
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  await createNotification({
    target_role: 'patient',
    target_user_id: req.user.id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    message: 'Your appointment has been cancelled.',
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'cancelled' })
  res.json({ message: 'Appointment cancelled.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time, notes } = req.body
  if (!appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Date and time required.' })
  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate))
    return res.status(400).json({ message: 'Invalid appointment date.' })
  if (normalizedDate < getTodayDateOnly())
    return res.status(400).json({ message: 'Cannot reschedule to a past date.' })
  await markOverdueAppointments()
  const [rows] = await db.query(
    'SELECT id, doctor_id, status FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed'].includes(rows[0].status))
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be rescheduled.' })

  const [conflict] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status IN ('pending','confirmed','rescheduled','in-progress') AND id != ?`,
    [rows[0].doctor_id, normalizedDate, appointment_time, req.params.id]
  )
  if (conflict.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  await db.query(
    "UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = 'pending', notes = COALESCE(?, notes) WHERE id = ?",
    [normalizedDate, appointment_time, notes?.trim() || null, req.params.id]
  )
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
  if (details[0]?.patient_email) {
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
  broadcast(['admin', 'staff', `patient_${req.user.id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'pending' })
  res.json({ message: 'Appointment rescheduled and returned to pending confirmation.' })
}

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name AS name, full_name, specialty FROM doctors WHERE is_active = 1 ORDER BY full_name'
  )
  res.json(rows)
}

const getDoctorSchedule = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1',
    [req.params.id]
  )
  res.json(rows)
}

module.exports = {
  register, verifyRegistration, login, checkAuth, logout,
  getAppointments, getHistory,
  createAppointment, cancelAppointment, rescheduleAppointment,
  getDoctors, getDoctorSchedule,
}
