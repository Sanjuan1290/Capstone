// server/controllers/patient.controller.js

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendVerificationCode } = require('../utils/emailService')

// In-memory pending registrations (keyed by email)
const pendingRegistrations = {}

// ─── Registration ─────────────────────────────────────────────────────────────

const register = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, password, confirmPassword } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address || !email || !password)
    return res.status(400).json({ message: 'All required fields must be filled.' })

  if (password !== confirmPassword)
    return res.status(400).json({ message: 'Passwords do not match.' })

  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'An account with that email already exists.' })

  const hashed = await bcrypt.hash(password, 10)
  const code   = String(Math.floor(100000 + Math.random() * 900000))

  pendingRegistrations[email] = {
    full_name, birthdate, sex, civil_status: civil_status || null,
    phone, address, email, password: hashed,
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
    'INSERT INTO patients (full_name, birthdate, sex, civil_status, phone, address, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [pending.full_name, pending.birthdate, pending.sex, pending.civil_status, pending.phone, pending.address, pending.email, pending.password]
  )

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
    user: { id: patient.id, full_name: patient.full_name, email: patient.email, role: 'patient' },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['patient_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'patient') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query('SELECT id, full_name, email FROM patients WHERE id = ?', [decoded.id])
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
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled')
     ORDER BY a.appointment_date DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const createAppointment = async (req, res) => {
  const { doctor_id, clinic_type, reason, appointment_date, appointment_time, notes } = req.body
  if (!doctor_id || !clinic_type || !appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Missing required fields.' })

  const [existing] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status NOT IN ('cancelled','rescheduled')`,
    [doctor_id, appointment_date, appointment_time]
  )
  if (existing.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes || null]
  )
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
  res.json({ message: 'Appointment cancelled.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time } = req.body
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
     AND status NOT IN ('cancelled','rescheduled') AND id != ?`,
    [rows[0].doctor_id, appointment_date, appointment_time, req.params.id]
  )
  if (conflict.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  await db.query(
    "UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = 'rescheduled' WHERE id = ?",
    [appointment_date, appointment_time, req.params.id]
  )
  res.json({ message: 'Appointment rescheduled.' })
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