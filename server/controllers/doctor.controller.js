// server/controllers/doctor.controller.js
// ADDED: getMyScheduleAll — returns ALL days for the doctor's own schedule page
// ADDED: saveMyScheduleDay — saves one day for the doctor's own schedule
//        Both use req.user.id so a doctor can NEVER touch another doctor's schedule.

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })
  const [rows] = await db.query('SELECT * FROM doctors WHERE email = ? AND is_active = 1', [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })
  const doctor = rows[0]
  const match = await bcrypt.compare(password, doctor.password)
  if (!match)
    return res.status(401).json({ message: 'Invalid email or password.' })
  const token = jwt.sign({ id: doctor.id, role: 'doctor' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'doctor')
  res.status(200).json({
    message: 'Login successful.',
    user: { id: doctor.id, full_name: doctor.full_name, email: doctor.email, specialty: doctor.specialty, role: 'doctor' },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['doctor_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'doctor') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query(
      'SELECT id, full_name, email, specialty FROM doctors WHERE id = ? AND is_active = 1', [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'doctor' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('doctor_token')
  res.status(200).json({ message: 'Logged out.' })
}

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const [[{ totalToday }]]      = await db.query(
    'SELECT COUNT(*) AS totalToday FROM appointments WHERE doctor_id = ? AND appointment_date = ?',
    [req.user.id, today]
  )
  const [[{ completed }]]       = await db.query(
    "SELECT COUNT(*) AS completed FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = 'completed'",
    [req.user.id, today]
  )
  const [[{ pending }]]         = await db.query(
    "SELECT COUNT(*) AS pending FROM appointments WHERE doctor_id = ? AND status = 'pending'",
    [req.user.id]
  )
  const [[{ pendingRequests }]] = await db.query(
    "SELECT COUNT(*) AS pendingRequests FROM supply_requests WHERE doctor_id = ? AND status = 'pending'",
    [req.user.id]
  )
  const [walkInQueue] = await db.query(
    `SELECT q.queue_number AS queueNo, q.patient_name AS patient,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt, q.type
     FROM queue q
     WHERE q.doctor_id = ? AND q.queue_date = ? AND q.status IN ('waiting','in-progress')
     ORDER BY q.queue_number ASC`,
    [req.user.id, today]
  )
  const [schedule] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json({ totalToday, completed, pending, pendingRequests, schedule, walkInQueue })
}

const getDailyAppointments = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const [rows] = await db.query(
    `SELECT a.*, a.appointment_time AS time, a.clinic_type AS type,
            p.full_name AS patient_name, p.full_name AS patient,
            p.birthdate, p.sex AS patient_sex,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age
     FROM appointments a JOIN patients p ON a.patient_id = p.id
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
  await db.query("UPDATE appointments SET status = 'in-progress' WHERE id = ?", [req.params.id])
  res.json({ message: 'Consultation started.' })
}

const saveConsultation = async (req, res) => {
  const { diagnosis, prescription, notes } = req.body
  const { appointmentId } = req.params
  const [apptRows] = await db.query(
    'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?',
    [appointmentId, req.user.id]
  )
  if (apptRows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  const appt = apptRows[0]
  const [existing] = await db.query('SELECT id FROM consultations WHERE appointment_id = ?', [appointmentId])
  if (existing.length > 0) {
    await db.query(
      'UPDATE consultations SET diagnosis=?, prescription=?, notes=? WHERE appointment_id=?',
      [diagnosis||null, prescription||null, notes||null, appointmentId]
    )
  } else {
    await db.query(
      'INSERT INTO consultations (appointment_id, doctor_id, patient_id, diagnosis, prescription, notes) VALUES (?,?,?,?,?,?)',
      [appointmentId, req.user.id, appt.patient_id, diagnosis||null, prescription||null, notes||null]
    )
  }
  await db.query("UPDATE appointments SET status='completed' WHERE id=?", [appointmentId])
  res.json({ message: 'Consultation saved.' })
}

const getPatientHistory = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time,
            a.clinic_type AS type, c.diagnosis, c.prescription,
            c.notes, c.notes AS consultation_notes, c.consulted_at
     FROM appointments a LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled')
     ORDER BY a.appointment_date DESC`,
    [req.params.id]
  )
  res.json(rows)
}

const getInventoryItems = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, category, unit, stock FROM inventory WHERE stock > 0 ORDER BY category, name'
  )
  res.json(rows)
}

const getMyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.unit, i.category
     FROM supply_requests sr JOIN inventory i ON sr.inventory_id = i.id
     WHERE sr.doctor_id = ? ORDER BY sr.requested_at DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const submitRequest = async (req, res) => {
  const { inventory_id, qty_requested, reason } = req.body
  if (!inventory_id || !qty_requested)
    return res.status(400).json({ message: 'inventory_id and qty_requested are required.' })
  const [result] = await db.query(
    'INSERT INTO supply_requests (doctor_id, inventory_id, qty_requested, reason) VALUES (?,?,?,?)',
    [req.user.id, inventory_id, qty_requested, reason||null]
  )
  const [rows] = await db.query(
    'SELECT sr.*, i.name AS item_name, i.unit FROM supply_requests sr JOIN inventory i ON sr.inventory_id = i.id WHERE sr.id = ?',
    [result.insertId]
  )
  res.status(201).json(rows[0])
}

// ── Doctor's own schedule (read-only active days) — used by dashboard ─────────
const getMySchedule = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json(rows)
}

// ── Doctor's own schedule — ALL days — used by Doctor_Schedule page ───────────
const getMyScheduleAll = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json(rows)
}

// ── Save one day of the doctor's own schedule ─────────────────────────────────
// Doctors can ONLY call this for themselves (req.user.id is enforced).
const saveMyScheduleDay = async (req, res) => {
  const { day_of_week, start_time, end_time, slot_duration_mins, is_active } = req.body
  if (!day_of_week || !start_time || !end_time)
    return res.status(400).json({ message: 'day_of_week, start_time, and end_time are required.' })

  const doctorId = req.user.id // ENFORCED — never from req.body/params
  const [existing] = await db.query(
    'SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [doctorId, day_of_week]
  )
  if (existing.length > 0) {
    await db.query(
      'UPDATE doctor_schedules SET start_time=?, end_time=?, slot_duration_mins=?, is_active=? WHERE doctor_id=? AND day_of_week=?',
      [start_time, end_time, slot_duration_mins||60, is_active??1, doctorId, day_of_week]
    )
  } else {
    await db.query(
      'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active) VALUES (?,?,?,?,?,?)',
      [doctorId, day_of_week, start_time, end_time, slot_duration_mins||60, is_active??1]
    )
  }
  res.json({ message: 'Schedule saved.' })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getPatientHistory,
  getInventoryItems, getMyRequests, submitRequest,
  getMySchedule,
  getMyScheduleAll,
  saveMyScheduleDay,
}