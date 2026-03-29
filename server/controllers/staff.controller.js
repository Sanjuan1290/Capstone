// server/controllers/staff.controller.js
// FIXES:
// 1. getInventory — returns flat items array (staff service expects array, not {items,logs})
//    Logs endpoint is separate if needed.
// 2. getDashboard — returns consistent shape that Staff_Dashboard.jsx expects.
// 3. resolveSupplyRequest — deducts inventory on approval (was missing).
// 4. All empty-state safe: all queries return arrays, never undefined.

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

// ── Auth ──────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query("SELECT * FROM staff WHERE email = ? AND status = 'active'", [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const staff = rows[0]
  const match = await bcrypt.compare(password, staff.password)
  if (!match)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const token = jwt.sign({ id: staff.id, role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'staff')

  res.status(200).json({
    message: 'Login successful.',
    user: { id: staff.id, full_name: staff.full_name, email: staff.email, role: 'staff' },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['staff_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'staff') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query(
      "SELECT id, full_name, email FROM staff WHERE id = ? AND status = 'active'", [decoded.id]
    )
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const [[{ totalToday }]]   = await db.query(
    'SELECT COUNT(*) AS totalToday FROM appointments WHERE appointment_date = ?', [today]
  )
  const [[{ pendingCount }]] = await db.query(
    "SELECT COUNT(*) AS pendingCount FROM appointments WHERE status = 'pending'"
  )
  const [[{ queueCount }]]   = await db.query(
    "SELECT COUNT(*) AS queueCount FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  const [[{ lowStock }]]     = await db.query(
    'SELECT COUNT(*) AS lowStock FROM inventory WHERE stock <= threshold'
  )
  const [[{ totalPatients }]] = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  res.json({ totalToday, pendingCount, queueCount, lowStock, totalPatients })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  const { date } = req.query
  let sql = `SELECT
               a.*,
               DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
               a.appointment_time AS time,
               a.clinic_type      AS type,
               p.full_name        AS patient_name,
               p.full_name        AS patient,
               p.email            AS patient_email,
               p.phone            AS patient_phone,
               DATE_FORMAT(p.birthdate, '%Y-%m-%d') AS patient_birthdate,
               p.sex              AS patient_sex,
               p.address          AS patient_address,
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

const createAppointment = async (req, res) => {
  const { patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes } = req.body
  if (!patient_id || !doctor_id || !clinic_type || !appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Missing required fields.' })

  const [existing] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id=? AND appointment_date=? AND appointment_time=?
     AND status NOT IN ('cancelled','rescheduled')`,
    [doctor_id, appointment_date, appointment_time]
  )
  if (existing.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes) VALUES (?,?,?,?,?,?,?)',
    [patient_id, doctor_id, clinic_type, reason || null, appointment_date, appointment_time, notes || null]
  )
  res.status(201).json({ message: 'Appointment created.', id: result.insertId })
}

const confirmAppointment = async (req, res) => {
  const [rows] = await db.query('SELECT id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query('SELECT id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  res.json({ message: 'Appointment cancelled.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time } = req.body
  if (!appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Date and time required.' })
  const [rows] = await db.query('SELECT id, doctor_id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })

  const [conflict] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id=? AND appointment_date=? AND appointment_time=?
     AND status NOT IN ('cancelled','rescheduled') AND id != ?`,
    [rows[0].doctor_id, appointment_date, appointment_time, req.params.id]
  )
  if (conflict.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  await db.query(
    "UPDATE appointments SET appointment_date=?, appointment_time=?, status='rescheduled' WHERE id=?",
    [appointment_date, appointment_time, req.params.id]
  )
  res.json({ message: 'Appointment rescheduled.' })
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const getQueue = async (req, res) => {
  const today = req.query.date || new Date().toISOString().split('T')[0]
  const [rows] = await db.query(
    `SELECT q.*, d.full_name AS doctor_name
     FROM queue q
     JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ?
     ORDER BY q.queue_number ASC`,
    [today]
  )
  res.json(rows)
}

const addToQueue = async (req, res) => {
  const { patient_id, doctor_id, patient_name, type } = req.body
  if (!doctor_id || !type)
    return res.status(400).json({ message: 'doctor_id and type are required.' })

  const today = new Date().toISOString().split('T')[0]
  const [[{ maxQ }]] = await db.query(
    'SELECT COALESCE(MAX(queue_number), 0) AS maxQ FROM queue WHERE queue_date = ?', [today]
  )
  const [result] = await db.query(
    'INSERT INTO queue (patient_id, doctor_id, queue_number, patient_name, type, status, queue_date) VALUES (?,?,?,?,?,?,?)',
    [patient_id || null, doctor_id, maxQ + 1, patient_name || 'Walk-in', type, 'waiting', today]
  )
  res.status(201).json({ id: result.insertId, queue_number: maxQ + 1 })
}

const updateQueueStatus = async (req, res) => {
  const { status } = req.body
  if (!['waiting','in-progress','done','removed'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' })
  await db.query('UPDATE queue SET status=? WHERE id=?', [status, req.params.id])
  res.json({ message: 'Queue updated.' })
}

// ── Patients ──────────────────────────────────────────────────────────────────

const getPatients = async (req, res) => {
  const search = req.query.search || ''
  const [rows] = await db.query(
    `SELECT id, full_name, email, phone, sex, birthdate, address, civil_status, created_at
     FROM patients
     WHERE full_name LIKE ? OR email LIKE ?
     ORDER BY full_name`,
    [`%${search}%`, `%${search}%`]
  )
  res.json(rows)
}

const getPatientRecord = async (req, res) => {
  const [pRows] = await db.query(
    `SELECT id, full_name, email, phone, sex, birthdate, address, civil_status, created_at
     FROM patients WHERE id = ?`,
    [req.params.id]
  )
  if (pRows.length === 0) return res.status(404).json({ message: 'Patient not found.' })
  const patient = pRows[0]

  const [history] = await db.query(
    `SELECT a.*, DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,
            d.full_name AS doctor_name, d.specialty,
            c.diagnosis, c.prescription, c.notes AS consultation_notes
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC`,
    [req.params.id]
  )

  res.json({ patient, history })
}

// ── Inventory ─────────────────────────────────────────────────────────────────

// FIX: returns flat array (staff.service maps it directly as array)
const getInventory = async (req, res) => {
  const [items] = await db.query('SELECT * FROM inventory ORDER BY category, name')
  res.json(items)
}

const addInventoryItem = async (req, res) => {
  const { barcode, name, category, unit, stock, threshold, price, supplier } = req.body
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })

  if (barcode) {
    const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
    if (existing.length > 0)
      return res.status(409).json({ message: 'An item with that barcode already exists.' })
  }

  const [result] = await db.query(
    'INSERT INTO inventory (barcode, name, category, unit, stock, threshold, price, supplier) VALUES (?,?,?,?,?,?,?,?)',
    [barcode || null, name, category, unit || 'box', stock || 0, threshold || 5, price || 0, supplier || null]
  )
  const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
  res.status(201).json(rows[0])
}

const updateStock = async (req, res) => {
  const { type, qty, note } = req.body
  if (!type || !qty)
    return res.status(400).json({ message: 'type and qty are required.' })
  const [rows] = await db.query('SELECT id, stock FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })

  const newStock = type === 'in' ? rows[0].stock + qty : Math.max(0, rows[0].stock - qty)
  await db.query('UPDATE inventory SET stock=? WHERE id=?', [newStock, req.params.id])
  await db.query(
    'INSERT INTO inventory_logs (inventory_id, type, qty, note) VALUES (?,?,?,?)',
    [req.params.id, type, qty, note || null]
  )
  res.json({ new_stock: newStock })
}

// ── Doctors list ──────────────────────────────────────────────────────────────

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name AS name, full_name, specialty, is_active FROM doctors WHERE is_active = 1 ORDER BY full_name'
  )
  res.json(rows)
}

// ── Supply Requests ───────────────────────────────────────────────────────────

const getSupplyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.unit, i.category,
            d.full_name AS doctor_name
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     JOIN doctors   d ON sr.doctor_id    = d.id
     ORDER BY FIELD(sr.status,'pending','approved','rejected'), sr.requested_at DESC`
  )
  res.json(rows)
}

// FIX: deduct inventory on approval (was missing in original)
const resolveSupplyRequest = async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'Status must be "approved" or "rejected".' })

  const [rows] = await db.query('SELECT * FROM supply_requests WHERE id = ?', [req.params.id])
  if (rows.length === 0)
    return res.status(404).json({ message: 'Supply request not found.' })
  if (rows[0].status !== 'pending')
    return res.status(400).json({ message: 'Only pending requests can be resolved.' })

  await db.query('UPDATE supply_requests SET status = ? WHERE id = ?', [status, req.params.id])

  if (status === 'approved') {
    await db.query(
      'UPDATE inventory SET stock = GREATEST(0, stock - ?) WHERE id = ?',
      [rows[0].qty_requested, rows[0].inventory_id]
    )
    await db.query(
      'INSERT INTO inventory_logs (inventory_id, type, qty, note) VALUES (?,?,?,?)',
      [rows[0].inventory_id, 'out', rows[0].qty_requested, 'Supply request approved']
    )
  }

  res.json({ message: `Request ${status}.` })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard,
  getAppointments, createAppointment, confirmAppointment, cancelAppointment, rescheduleAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getInventory, addInventoryItem, updateStock,
  getDoctors,
  getSupplyRequests, resolveSupplyRequest,
}