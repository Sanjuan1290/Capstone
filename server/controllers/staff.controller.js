// server/controllers/staff.controller.js

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
  const [[{ pendingApprovals }]] = await db.query("SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE status = 'pending'")
  const [[{ lowStockCount }]]    = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= threshold')
  const [[{ activeQueue }]]      = await db.query(
    "SELECT COUNT(*) AS activeQueue FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  res.json({ totalPatients, todayAppts, pendingApprovals, lowStockCount, activeQueue })
}

const getAppointments = async (req, res) => {
  const { date } = req.query
  let sql = `SELECT
               a.*,
               a.appointment_date AS date,
               a.appointment_time AS time,
               a.clinic_type      AS type,
               p.full_name        AS patient,
               d.full_name        AS doctor
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
  const [rows] = await db.query('SELECT id, status FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query('SELECT id, status FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  res.json({ message: 'Appointment cancelled.' })
}

const getQueue = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const [rows] = await db.query(
    `SELECT
       q.*,
       q.queue_number                         AS queueNo,
       q.patient_name                         AS patient,
       d.full_name                            AS doctor,
       TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ?
     ORDER BY q.queue_number ASC`,
    [date]
  )
  res.json(rows)
}

const addToQueue = async (req, res) => {
  const { patient, type, doctor, queueNo, queue_date } = req.body
  const doctorRows = await db.query('SELECT id FROM doctors WHERE full_name = ?', [doctor])
  const doctor_id  = doctorRows[0]?.[0]?.id
  if (!doctor_id) return res.status(400).json({ message: 'Doctor not found.' })

  const [result] = await db.query(
    'INSERT INTO queue (patient_name, type, doctor_id, queue_number, queue_date) VALUES (?, ?, ?, ?, ?)',
    [patient, type, doctor_id, queueNo, queue_date]
  )
  const [newRow] = await db.query(
    `SELECT q.*, q.queue_number AS queueNo, q.patient_name AS patient,
            d.full_name AS doctor, TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q JOIN doctors d ON q.doctor_id = d.id WHERE q.id = ?`,
    [result.insertId]
  )
  res.status(201).json(newRow[0])
}

const updateQueueStatus = async (req, res) => {
  const { status } = req.body
  if (!['waiting','in-progress','done','removed'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' })
  await db.query('UPDATE queue SET status = ? WHERE id = ?', [status, req.params.id])
  res.json({ message: 'Queue status updated.' })
}

const getPatients = async (req, res) => {
  const { search } = req.query
  let sql = `SELECT
               p.id,
               p.full_name     AS name,
               p.email,
               p.phone,
               p.birthdate,
               p.sex,
               p.civil_status  AS civilStatus,
               p.address,
               TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS age,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status = 'completed') AS totalVisits,
               (SELECT DATE_FORMAT(MAX(appointment_date), '%b %d, %Y') FROM appointments WHERE patient_id = p.id AND status = 'completed') AS lastVisit
             FROM patients p`
  const params = []
  if (search) {
    sql += ' WHERE p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ?'
    const like = `%${search}%`
    params.push(like, like, like)
  }
  sql += ' ORDER BY p.full_name ASC'
  const [rows] = await db.query(sql, params)
  res.json(rows)
}

const getPatientRecord = async (req, res) => {
  const { id } = req.params
  const [[patient]] = await db.query(
    `SELECT p.id, p.full_name AS name, p.email, p.phone, p.birthdate, p.sex,
            p.civil_status AS civilStatus, p.address,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS age,
            (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status = 'completed') AS totalVisits,
            (SELECT DATE_FORMAT(MAX(appointment_date), '%b %d, %Y') FROM appointments WHERE patient_id = p.id AND status = 'completed') AS lastVisit
     FROM patients p WHERE p.id = ?`,
    [id]
  )
  if (!patient) return res.status(404).json({ message: 'Patient not found.' })

  const [history] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time, a.clinic_type AS type,
            d.full_name AS doctor, c.diagnosis, c.prescription, c.notes
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled')
     ORDER BY a.appointment_date DESC`,
    [id]
  )

  const [upcoming] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time, a.clinic_type AS type,
            d.full_name AS doctor
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ? AND a.status IN ('pending','confirmed')
     ORDER BY a.appointment_date ASC`,
    [id]
  )

  res.json({ patient, history, upcoming })
}

const getInventory = async (req, res) => {
  const [items] = await db.query('SELECT * FROM inventory ORDER BY category, name')
  const [logs]  = await db.query(
    `SELECT il.*, i.name AS item_name
     FROM inventory_logs il
     LEFT JOIN inventory i ON il.inventory_id = i.id
     ORDER BY il.logged_at DESC
     LIMIT 200`
  )
  res.json({ items, logs })
}

const updateStock = async (req, res) => {
  const { type, qty, note } = req.body
  const { id } = req.params
  if (!['in','out'].includes(type) || !qty || qty < 1)
    return res.status(400).json({ message: 'Invalid type or qty.' })

  const [[item]] = await db.query('SELECT id, stock FROM inventory WHERE id = ?', [id])
  if (!item) return res.status(404).json({ message: 'Item not found.' })

  const newStock = type === 'in' ? item.stock + qty : Math.max(0, item.stock - qty)
  await db.query('UPDATE inventory SET stock = ? WHERE id = ?', [newStock, id])

  const [logResult] = await db.query(
    'INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note) VALUES (?, ?, ?, ?, ?)',
    [id, req.user?.id || null, type, qty, note || null]
  )
  const [[log]] = await db.query('SELECT * FROM inventory_logs WHERE id = ?', [logResult.insertId])

  res.json({ message: 'Stock updated.', new_stock: newStock, log })
}

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS name, full_name, specialty,
            CASE WHEN specialty = 'Dermatologist' THEN 'derma' ELSE 'medical' END AS type
     FROM doctors WHERE is_active = 1 ORDER BY full_name`
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

// ── ✅ NEW: Supply request management for staff ───────────────────────────────

const getSupplyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT
       sr.*,
       i.name     AS item_name,
       i.unit,
       i.category,
       d.full_name AS doctor_name
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     JOIN doctors   d ON sr.doctor_id    = d.id
     ORDER BY
       FIELD(sr.status, 'pending', 'approved', 'rejected'),
       sr.requested_at DESC`
  )
  res.json(rows)
}

const resolveSupplyRequest = async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'Status must be "approved" or "rejected".' })

  const [rows] = await db.query('SELECT id, status FROM supply_requests WHERE id = ?', [req.params.id])
  if (rows.length === 0)
    return res.status(404).json({ message: 'Supply request not found.' })
  if (rows[0].status !== 'pending')
    return res.status(400).json({ message: 'Only pending requests can be resolved.' })

  await db.query('UPDATE supply_requests SET status = ? WHERE id = ?', [status, req.params.id])
  res.json({ message: `Request ${status}.` })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getInventory, updateStock,
  getDoctors, addInventoryItem,
  // ✅ NEW exports
  getSupplyRequests, resolveSupplyRequest,
}