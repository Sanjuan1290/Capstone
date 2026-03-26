const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const [rows] = await db.query('SELECT * FROM doctors WHERE email = ? AND is_active = 1', [email])
  if (rows.length === 0) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const doctor = rows[0]
  const match = await bcrypt.compare(password, doctor.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const token = jwt.sign(
    { id: doctor.id, role: 'doctor' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(200).json({
    message: 'Login successful.',
    user: { id: doctor.id, full_name: doctor.full_name, email: doctor.email, specialty: doctor.specialty, role: 'doctor' }
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies.token
  if (!token) return res.status(200).json({ authenticated: false })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'doctor') return res.status(200).json({ authenticated: false })

    const [rows] = await db.query(
      'SELECT id, full_name, email, specialty FROM doctors WHERE id = ? AND is_active = 1',
      [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })

    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'doctor' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('token')
  res.status(200).json({ message: 'Logged out.' })
}

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]

  const [[{ totalToday }]] = await db.query(
    `SELECT COUNT(*) AS totalToday FROM appointments
     WHERE doctor_id = ? AND appointment_date = ?`,
    [req.user.id, today]
  )
  const [[{ completed }]] = await db.query(
    `SELECT COUNT(*) AS completed FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND status = 'completed'`,
    [req.user.id, today]
  )
  const [[{ pending }]] = await db.query(
    `SELECT COUNT(*) AS pending FROM appointments
     WHERE doctor_id = ? AND status = 'pending'`,
    [req.user.id]
  )
  const [[{ pendingRequests }]] = await db.query(
    `SELECT COUNT(*) AS pendingRequests FROM supply_requests
     WHERE doctor_id = ? AND status = 'pending'`,
    [req.user.id]
  )

  const [schedule] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )

  res.json({ totalToday, completed, pending, pendingRequests, schedule })
}

const getDailyAppointments = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]

  const [rows] = await db.query(
    `SELECT a.*,
            p.full_name   AS patient_name,
            p.birthdate,
            p.sex         AS patient_sex,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     WHERE a.doctor_id = ? AND a.appointment_date = ?
     ORDER BY a.appointment_time ASC`,
    [req.user.id, date]
  )
  res.json(rows)
}

const startConsultation = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })

  await db.query(
    "UPDATE appointments SET status = 'in-progress' WHERE id = ?",
    [req.params.id]
  )
  res.json({ message: 'Consultation started.' })
}

const saveConsultation = async (req, res) => {
  const { diagnosis, notes, prescription } = req.body
  const appointmentId = req.params.appointmentId

  if (!diagnosis) return res.status(400).json({ message: 'Diagnosis is required.' })

  const [apptRows] = await db.query(
    'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?',
    [appointmentId, req.user.id]
  )
  if (apptRows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })

  const appt = apptRows[0]

  // Upsert consultation
  const [existing] = await db.query(
    'SELECT id FROM consultations WHERE appointment_id = ?', [appointmentId])

  if (existing.length > 0) {
    await db.query(
      'UPDATE consultations SET diagnosis = ?, prescription = ?, notes = ? WHERE appointment_id = ?',
      [diagnosis, prescription || null, notes || null, appointmentId]
    )
  } else {
    await db.query(
      `INSERT INTO consultations (appointment_id, doctor_id, patient_id, diagnosis, prescription, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [appointmentId, req.user.id, appt.patient_id, diagnosis, prescription || null, notes || null]
    )
  }

  // Mark appointment as completed
  await db.query(
    "UPDATE appointments SET status = 'completed' WHERE id = ?", [appointmentId])

  res.json({ message: 'Consultation saved.' })
}

const getPatientHistory = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, c.diagnosis, c.prescription, c.notes AS consultation_notes,
            d.full_name AS doctor_name, d.specialty
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled')
     ORDER BY a.appointment_date DESC`,
    [req.params.id]
  )
  res.json(rows)
}

const getInventoryItems = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, category, unit, stock, threshold FROM inventory WHERE stock > 0 ORDER BY category, name'
  )
  res.json(rows)
}

const getMyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.category, i.unit
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     WHERE sr.doctor_id = ?
     ORDER BY sr.requested_at DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const submitRequest = async (req, res) => {
  const { inventory_id, qty_requested, reason } = req.body

  if (!inventory_id || !qty_requested) {
    return res.status(400).json({ message: 'Item and quantity are required.' })
  }

  const [itemRows] = await db.query('SELECT * FROM inventory WHERE id = ?', [inventory_id])
  if (itemRows.length === 0) return res.status(404).json({ message: 'Item not found.' })

  const [result] = await db.query(
    `INSERT INTO supply_requests (doctor_id, inventory_id, qty_requested, reason)
     VALUES (?, ?, ?, ?)`,
    [req.user.id, inventory_id, qty_requested, reason || null]
  )

  const [newRow] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.category, i.unit
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     WHERE sr.id = ?`,
    [result.insertId]
  )
  res.status(201).json(newRow[0])
}

const getMySchedule = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json(rows)
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getPatientHistory,
  getInventoryItems, getMyRequests, submitRequest,
  getMySchedule
}