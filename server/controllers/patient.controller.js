const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const register = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, password } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' })
  }

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0) {
    return res.status(409).json({ message: 'Email already registered.' })
  }

  const hashed = await bcrypt.hash(password, 10)

  const [result] = await db.query(
    `INSERT INTO patients (full_name, birthdate, sex, civil_status, phone, address, email, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [full_name, birthdate, sex, civil_status || null, phone, address, email, hashed]
  )

  const token = jwt.sign(
    { id: result.insertId, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(201).json({
    message: 'Registered successfully.',
    user: { id: result.insertId, full_name, email, role: 'patient' }
  })
}

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const [rows] = await db.query('SELECT * FROM patients WHERE email = ?', [email])
  if (rows.length === 0) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const patient = rows[0]
  const match = await bcrypt.compare(password, patient.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const token = jwt.sign(
    { id: patient.id, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(200).json({
    message: 'Login successful.',
    user: { id: patient.id, full_name: patient.full_name, email: patient.email, role: 'patient' }
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies.token
  if (!token) return res.status(200).json({ authenticated: false })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'patient') return res.status(200).json({ authenticated: false })

    const [rows] = await db.query(
      'SELECT id, full_name, email FROM patients WHERE id = ?',
      [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })

    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'patient' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('token')
  res.status(200).json({ message: 'Logged out.' })
}

const getAppointments = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, d.full_name AS doctor_name, d.specialty
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const getHistory = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, d.full_name AS doctor_name, d.specialty,
            c.diagnosis, c.prescription, c.notes AS consultation_notes
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

  if (!doctor_id || !clinic_type || !appointment_date || !appointment_time) {
    return res.status(400).json({ message: 'Missing required fields.' })
  }

  // Check for duplicate booking on same slot
  const [existing] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status NOT IN ('cancelled','rescheduled')`,
    [doctor_id, appointment_date, appointment_time]
  )
  if (existing.length > 0) {
    return res.status(409).json({ message: 'That time slot is already taken.' })
  }

  const [result] = await db.query(
    `INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
  if (!['pending','confirmed'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be cancelled.' })
  }

  await db.query(
    'UPDATE appointments SET status = ? WHERE id = ?',
    ['cancelled', req.params.id]
  )
  res.json({ message: 'Appointment cancelled.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time } = req.body
  const [rows] = await db.query(
    'SELECT id, doctor_id, status FROM appointments WHERE id = ? AND patient_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending','confirmed'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending or confirmed appointments can be rescheduled.' })
  }

  // Check the new slot is free
  const [conflict] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status NOT IN ('cancelled','rescheduled') AND id != ?`,
    [rows[0].doctor_id, appointment_date, appointment_time, req.params.id]
  )
  if (conflict.length > 0) {
    return res.status(409).json({ message: 'That time slot is already taken.' })
  }

  await db.query(
    'UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = ? WHERE id = ?',
    [appointment_date, appointment_time, 'pending', req.params.id]
  )
  res.json({ message: 'Appointment rescheduled.' })
}

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name, specialty FROM doctors WHERE is_active = 1 ORDER BY full_name'
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
  register, login, checkAuth, logout,
  getAppointments, getHistory,
  createAppointment, cancelAppointment, rescheduleAppointment,
  getDoctors, getDoctorSchedule
}