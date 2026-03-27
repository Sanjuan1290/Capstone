// server/controllers/staff.controller.js
// FIXES:
// - getDashboard: renamed inQueue→activeQueue and pendingAppts→pendingApprovals to match Staff_Dashboard.jsx
// - getAppointments: added date/time/type/patient/doctor aliases so Staff_Appointments.jsx works
// - getQueue: added arrivedAt alias, queueNo alias

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query('SELECT * FROM staff WHERE email = ? AND status = "active"', [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const member = rows[0]
  const match = await bcrypt.compare(password, member.password)
  if (!match)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const token = jwt.sign({ id: member.id, role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'staff')

  res.status(200).json({
    message: 'Login successful.',
    user: { id: member.id, full_name: member.full_name, email: member.email, role: 'staff' },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['staff_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'staff') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query('SELECT id, full_name, email, role FROM staff WHERE id = ?', [decoded.id])
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'staff' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('staff_token')
  res.status(200).json({ message: 'Logged out.' })
}

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const [[{ totalPatients }]]    = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  const [[{ todayAppts }]]       = await db.query('SELECT COUNT(*) AS todayAppts FROM appointments WHERE appointment_date = ?', [today])
  // FIX: renamed to pendingApprovals to match Staff_Dashboard.jsx stats
  const [[{ pendingApprovals }]] = await db.query("SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE status = 'pending'")
  // FIX: renamed to lowStockCount to match Staff_Dashboard.jsx stats
  const [[{ lowStockCount }]]    = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= threshold')
  // FIX: renamed to activeQueue to match Staff_Dashboard.jsx stats
  const [[{ activeQueue }]]      = await db.query(
    "SELECT COUNT(*) AS activeQueue FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  res.json({ totalPatients, todayAppts, pendingApprovals, lowStockCount, activeQueue })
}

const getAppointments = async (req, res) => {
  const { date } = req.query
  // FIX: added aliases so Staff_Appointments.jsx fields (appt.patient, appt.doctor, appt.date, appt.time, appt.type) work
  let sql = `SELECT
               a.*,
               a.appointment_date AS date,
               a.appointment_time AS time,
               a.clinic_type      AS type,
               p.full_name        AS patient_name,
               p.full_name        AS patient,
               d.full_name        AS doctor_name,
               d.full_name        AS doctor,
               d.specialty
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN doctors  d ON a.doctor_id  = d.id`
  const params = []
  if (date) { sql += ' WHERE a.appointment_date = ?'; params.push(date) }
  sql += ' ORDER BY a.appointment_date ASC, a.appointment_time ASC'
  const [rows] = await db.query(sql, params)
  res.json(rows)
}

const confirmAppointment = async (req, res) => {
  const [rows] = await db.query('SELECT id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  res.json({ message: 'Confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query('SELECT id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  res.json({ message: 'Cancelled.' })
}

const getQueue = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  // FIX: added queueNo alias and arrivedAt alias to match QueueCard component
  const [rows] = await db.query(
    `SELECT
       q.*,
       q.queue_number                                              AS queueNo,
       q.patient_name                                             AS patient,
       TIME_FORMAT(q.arrived_at, '%h:%i %p')                     AS arrivedAt,
       d.full_name                                                AS doctor_name,
       d.full_name                                                AS doctor
     FROM queue q
     JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ? ORDER BY q.queue_number ASC`,
    [date]
  )
  res.json(rows)
}

const addToQueue = async (req, res) => {
  const { doctor_id, patient_name, type, queue_date, patient_id } = req.body
  if (!doctor_id || !patient_name || !type || !queue_date)
    return res.status(400).json({ message: 'Missing required fields.' })

  const [[{ maxNo }]] = await db.query(
    'SELECT COALESCE(MAX(queue_number), 0) AS maxNo FROM queue WHERE queue_date = ?', [queue_date]
  )
  const queue_number = maxNo + 1

  const [result] = await db.query(
    "INSERT INTO queue (patient_id, doctor_id, queue_number, patient_name, type, status, queue_date) VALUES (?, ?, ?, ?, ?, 'waiting', ?)",
    [patient_id || null, doctor_id, queue_number, patient_name, type, queue_date]
  )
  const [newRow] = await db.query(
    `SELECT
       q.*,
       q.queue_number                          AS queueNo,
       q.patient_name                          AS patient,
       TIME_FORMAT(q.arrived_at, '%h:%i %p')  AS arrivedAt,
       d.full_name                             AS doctor_name,
       d.full_name                             AS doctor
     FROM queue q JOIN doctors d ON q.doctor_id = d.id WHERE q.id = ?`,
    [result.insertId]
  )
  res.status(201).json(newRow[0])
}

const updateQueueStatus = async (req, res) => {
  const { status } = req.body
  const allowed = ['waiting', 'in-progress', 'done', 'removed']
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status.' })
  await db.query('UPDATE queue SET status = ? WHERE id = ?', [status, req.params.id])
  res.json({ message: 'Queue status updated.' })
}

const getPatients = async (req, res) => {
  const { search } = req.query
  // FIX: added aliases patient.name, patient.age, patient.totalVisits, patient.lastVisit
  let sql = `SELECT
               p.id,
               p.full_name                                            AS name,
               p.full_name,
               p.email,
               p.phone,
               p.birthdate,
               p.sex,
               p.civil_status                                         AS civilStatus,
               p.address,
               TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE())           AS age,
               COUNT(DISTINCT a.id)                                   AS total_visits,
               COUNT(DISTINCT a.id)                                   AS totalVisits,
               MAX(a.appointment_date)                                AS last_visit,
               DATE_FORMAT(MAX(a.appointment_date), '%b %d, %Y')     AS lastVisit
             FROM patients p
             LEFT JOIN appointments a ON a.patient_id = p.id AND a.status = 'completed'`
  const params = []
  if (search) {
    sql += ' WHERE p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ?'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  sql += ' GROUP BY p.id ORDER BY p.full_name ASC'
  const [rows] = await db.query(sql, params)
  res.json(rows)
}

const getPatientRecord = async (req, res) => {
  const { id } = req.params
  const [patientRows] = await db.query(
    `SELECT p.*,
            p.full_name AS name,
            p.civil_status AS civilStatus,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS age,
            (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status = 'completed') AS totalVisits,
            (SELECT DATE_FORMAT(MAX(appointment_date), '%b %d, %Y') FROM appointments WHERE patient_id = p.id AND status = 'completed') AS lastVisit
     FROM patients p WHERE p.id = ?`, [id]
  )
  if (patientRows.length === 0) return res.status(404).json({ message: 'Patient not found.' })

  // FIX: added date/time/type/doctor/reason aliases for Staff_PatientRecord history/upcoming tabs
  const [history] = await db.query(
    `SELECT
       a.*,
       a.appointment_date                         AS date,
       a.appointment_time                         AS time,
       a.clinic_type                              AS type,
       a.reason,
       d.full_name                                AS doctor_name,
       d.full_name                                AS doctor,
       d.specialty,
       c.diagnosis,
       c.prescription
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled')
     ORDER BY a.appointment_date DESC`, [id]
  )
  const [upcoming] = await db.query(
    `SELECT
       a.*,
       a.appointment_date  AS date,
       a.appointment_time  AS time,
       a.clinic_type       AS type,
       a.reason,
       d.full_name         AS doctor_name,
       d.full_name         AS doctor,
       d.specialty
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ? AND a.status IN ('pending','confirmed')
     ORDER BY a.appointment_date ASC`, [id]
  )
  res.json({ ...patientRows[0], history, upcoming })
}

const getInventory = async (req, res) => {
  const [items] = await db.query('SELECT * FROM inventory ORDER BY category, name')
  const [logs]  = await db.query(
    `SELECT l.*, i.name AS item_name, s.full_name AS staff_name
     FROM inventory_logs l
     JOIN inventory i ON l.inventory_id = i.id
     LEFT JOIN staff s ON l.staff_id = s.id
     ORDER BY l.logged_at DESC LIMIT 50`
  )
  res.json({ items, logs })
}

const updateStock = async (req, res) => {
  const { type, qty, note } = req.body
  const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })
  const item = rows[0]
  const newStock = type === 'in' ? item.stock + qty : item.stock - qty
  if (newStock < 0) return res.status(400).json({ message: 'Insufficient stock.' })
  await db.query('UPDATE inventory SET stock = ? WHERE id = ?', [newStock, req.params.id])
  const [logResult] = await db.query(
    'INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, req.user.id, type, qty, note || null]
  )
  const [logRow] = await db.query(
    'SELECT l.*, i.name AS item_name FROM inventory_logs l JOIN inventory i ON l.inventory_id = i.id WHERE l.id = ?',
    [logResult.insertId]
  )
  res.json({ new_stock: newStock, log: logRow[0] })
}

const getDoctors = async (req, res) => {
  // FIX: added id field so addToQueue can use doctor.id
  const [rows] = await db.query(
    'SELECT id, full_name AS name, full_name, specialty FROM doctors WHERE is_active = 1 ORDER BY full_name'
  )
  res.json(rows)
}

const addInventoryItem = async (req, res) => {
  const { barcode, name, category, unit, stock, threshold, price, supplier } = req.body
  if (!barcode || !name || !category)
    return res.status(400).json({ message: 'Barcode, name, and category are required.' })
  const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
  if (existing.length > 0)
    return res.status(409).json({ message: 'An item with that barcode already exists.' })
  const [result] = await db.query(
    'INSERT INTO inventory (barcode, name, category, unit, stock, threshold, price, supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [barcode, name, category, unit || 'box', stock || 0, threshold || 5, price || 0, supplier || '']
  )
  const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
  res.status(201).json(rows[0])
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getInventory, updateStock,
  getDoctors, addInventoryItem,
}