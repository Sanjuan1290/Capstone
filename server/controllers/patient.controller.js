// server/controllers/patient.controller.js
// FIXES:
// - getAppointments: added date/time/type/doctor/specialty aliases for MyAppointments.jsx
// - getHistory: added date/time/type/doctor/clinic aliases for History.jsx
// - getDoctorSchedule: kept as-is (correct)

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendVerificationCode } = require('../utils/emailService')

const pendingVerifications = {}

// ─── Register Step 1 ─────────────────────────────────────────────────────────

const register = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, password } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address || !email || !password)
    return res.status(400).json({ message: 'All fields are required.' })

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already registered.' })

  const code    = Math.floor(100000 + Math.random() * 900000).toString()
  const expires = Date.now() + 10 * 60 * 1000
  const hashed  = await bcrypt.hash(password, 10)

  pendingVerifications[email] = {
    code,
    expires,
    data: { full_name, birthdate, sex, civil_status: civil_status || null, phone, address, email, password: hashed },
  }

  // FIX: non-blocking — always respond 200 even if email fails
  try {
    await sendVerificationCode(email, full_name, code)
    console.log(`✅ Verification code sent to ${email}: ${code}`)
  } catch (err) {
    console.error('⚠️  Verification email failed:', err.message)
    // Print code to console so dev can test without email
    console.log(`📋 DEV MODE — verification code for ${email}: ${code}`)
  }

  res.status(200).json({
    message: 'Verification code sent to your email. Please check your inbox.',
    email,
  })
}

// ─── Register Step 2 ─────────────────────────────────────────────────────────

const verifyRegistration = async (req, res) => {
  const { email, code } = req.body
  if (!email || !code)
    return res.status(400).json({ message: 'Email and code are required.' })

  const pending = pendingVerifications[email]
  if (!pending)
    return res.status(400).json({ message: 'No pending registration found. Please register again.' })
  if (Date.now() > pending.expires) {
    delete pendingVerifications[email]
    return res.status(400).json({ message: 'Code expired. Please register again.' })
  }
  if (pending.code !== String(code).trim())
    return res.status(400).json({ message: 'Incorrect verification code.' })

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0) {
    delete pendingVerifications[email]
    return res.status(409).json({ message: 'Email already registered.' })
  }

  const { full_name, birthdate, sex, civil_status, phone, address, password } = pending.data
  const [result] = await db.query(
    'INSERT INTO patients (full_name, birthdate, sex, civil_status, phone, address, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [full_name, birthdate, sex, civil_status, phone, address, email, password]
  )
  delete pendingVerifications[email]

  const token = jwt.sign({ id: result.insertId, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'patient')

  res.status(201).json({
    message: 'Account created successfully!',
    user: { id: result.insertId, full_name, email, role: 'patient' },
  })
}

// ─── Login ────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query('SELECT * FROM patients WHERE email = ?', [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const patient = rows[0]
  const match = await bcrypt.compare(password, patient.password)
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
  // FIX: added date/time/type/doctor/specialty aliases so MyAppointments.jsx works
  const [rows] = await db.query(
    `SELECT
       a.*,
       a.appointment_date                           AS date,
       a.appointment_time                           AS time,
       a.clinic_type                                AS type,
       d.full_name                                  AS doctor_name,
       d.full_name                                  AS doctor,
       d.specialty,
       CASE a.clinic_type
         WHEN 'derma'   THEN 'Dermatology'
         WHEN 'medical' THEN 'General Medicine'
         ELSE a.clinic_type
       END                                          AS clinic
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const getHistory = async (req, res) => {
  // FIX: added date/time/type/doctor/clinic aliases so History.jsx works
  const [rows] = await db.query(
    `SELECT
       a.*,
       a.appointment_date                           AS date,
       a.appointment_time                           AS time,
       a.clinic_type                                AS type,
       a.appointment_date                           AS rawDate,
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
    "UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = 'pending' WHERE id = ?",
    [appointment_date, appointment_time, req.params.id]
  )
  res.json({ message: 'Appointment rescheduled.' })
}

const getDoctors = async (req, res) => {
  // FIX: added name alias so BookAppointment.jsx doc.name works
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