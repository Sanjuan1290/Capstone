// server/controllers/admin.controller.js
// FIXES:
// - getDashboard: renamed lowStock→lowStockCount so frontend stat card works
// - getDashboard: doctorStatus mapped to match frontend fields (name/specialty/status/done/patients)
// - getAppointments: added patient_name, doctor_name aliases already present — added time/date aliases
// - createStaff/createDoctor: graceful email failure already handled

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendTempPassword } = require('../utils/emailService')

// ─── Auth ─────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email])
  if (rows.length === 0)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const admin = rows[0]
  const match = await bcrypt.compare(password, admin.password)
  if (!match)
    return res.status(401).json({ message: 'Invalid email or password.' })

  const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' })
  generateCookie(res, token, 'admin')

  res.status(200).json({
    message: 'Login successful.',
    user: { id: admin.id, full_name: admin.full_name, email: admin.email, role: 'admin' },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['admin_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query('SELECT id, full_name, email FROM admins WHERE id = ?', [decoded.id])
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'admin' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('admin_token')
  res.status(200).json({ message: 'Logged out.' })
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const [[{ totalPatients }]]  = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  const [[{ todayAppts }]]     = await db.query('SELECT COUNT(*) AS todayAppts FROM appointments WHERE appointment_date = ?', [today])
  const [[{ pendingAppts }]]   = await db.query("SELECT COUNT(*) AS pendingAppts FROM appointments WHERE status = 'pending'")
  const [[{ totalStaff }]]     = await db.query('SELECT COUNT(*) AS totalStaff FROM staff WHERE status = "active"')
  const [[{ totalDoctors }]]   = await db.query('SELECT COUNT(*) AS totalDoctors FROM doctors WHERE is_active = 1')

  // FIX: renamed to lowStockCount so Admin_Dashboard stat card works
  const [[{ lowStockCount }]]  = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= threshold AND stock > 0')
  const [[{ outOfStock }]]     = await db.query('SELECT COUNT(*) AS outOfStock FROM inventory WHERE stock = 0')

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  // FIX: mapped columns to match what Admin_Dashboard.jsx expects:
  // doc.name, doc.specialty, doc.status ('on-duty'|'off-duty'), doc.done, doc.patients
  const [doctorStatus] = await db.query(
    `SELECT
       d.id,
       d.full_name            AS name,
       d.specialty,
       CASE WHEN ds.is_active = 1 THEN 'on-duty' ELSE 'off-duty' END AS status,
       COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END)                        AS done,
       COUNT(DISTINCT CASE WHEN a.status IN ('pending','confirmed','in-progress') THEN a.id END) AS remaining,
       COUNT(DISTINCT a.id)   AS patients
     FROM doctors d
     LEFT JOIN doctor_schedules ds ON ds.doctor_id = d.id AND ds.day_of_week = ? AND ds.is_active = 1
     LEFT JOIN appointments a ON a.doctor_id = d.id AND a.appointment_date = ?
     WHERE d.is_active = 1
     GROUP BY d.id`,
    [dayName, today]
  )

  res.json({
    totalPatients,
    todayAppts,
    pendingAppts,
    totalStaff,
    totalDoctors,
    lowStockCount,   // FIX: was lowStock, now lowStockCount
    outOfStock,
    doctorStatus,
  })
}

// ─── Appointments ─────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  const { date } = req.query
  // FIX: added appointment_date AS date, appointment_time AS time so frontend fields work
  let sql = `SELECT
               a.*,
               a.appointment_date AS date,
               a.appointment_time AS time,
               a.clinic_type      AS type,
               p.full_name        AS patient_name,
               d.full_name        AS doctor_name,
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
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  res.json({ message: 'Confirmed.' })
}

const cancelAppointment = async (req, res) => {
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  res.json({ message: 'Cancelled.' })
}

// ─── Staff ────────────────────────────────────────────────────────────────────

const getStaff = async (req, res) => {
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff ORDER BY full_name')
  res.json(rows)
}

const createStaff = async (req, res) => {
  const { full_name, email, phone } = req.body
  if (!full_name || !email)
    return res.status(400).json({ message: 'Name and email are required.' })

  const [existing] = await db.query('SELECT id FROM staff WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })

  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
  const hashed = await bcrypt.hash(tempPassword, 10)

  const [result] = await db.query(
    'INSERT INTO staff (full_name, email, phone, password) VALUES (?, ?, ?, ?)',
    [full_name, email, phone || null, hashed]
  )
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?',
    [result.insertId]
  )

  // FIX: non-blocking email — always return success even if email fails
  try {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/staff/login`
    await sendTempPassword(email, full_name, 'Staff', tempPassword, loginUrl)
    console.log(`✅ Welcome email sent to ${email}`)
  } catch (err) {
    console.error('⚠️  Welcome email failed (account still created):', err.message)
  }

  res.status(201).json(rows[0])
}

const toggleStaff = async (req, res) => {
  const [rows] = await db.query('SELECT status FROM staff WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  const newStatus = rows[0].status === 'active' ? 'inactive' : 'active'
  await db.query('UPDATE staff SET status = ? WHERE id = ?', [newStatus, req.params.id])
  res.json({ status: newStatus })
}

// ─── Doctors ──────────────────────────────────────────────────────────────────

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, specialty, is_active, created_at FROM doctors ORDER BY full_name'
  )
  res.json(rows)
}

const createDoctor = async (req, res) => {
  const { full_name, email, phone, specialty } = req.body
  if (!full_name || !email)
    return res.status(400).json({ message: 'Name and email are required.' })

  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })

  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
  const hashed = await bcrypt.hash(tempPassword, 10)

  const [result] = await db.query(
    'INSERT INTO doctors (full_name, email, phone, specialty, password) VALUES (?, ?, ?, ?, ?)',
    [full_name, email, phone || null, specialty || null, hashed]
  )
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, specialty, is_active, created_at FROM doctors WHERE id = ?',
    [result.insertId]
  )

  // FIX: non-blocking email
  try {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/doctor/login`
    await sendTempPassword(email, full_name, 'Doctor', tempPassword, loginUrl)
    console.log(`✅ Welcome email sent to ${email}`)
  } catch (err) {
    console.error('⚠️  Welcome email failed (account still created):', err.message)
  }

  res.status(201).json(rows[0])
}

const toggleDoctor = async (req, res) => {
  const [rows] = await db.query('SELECT is_active FROM doctors WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  const newVal = rows[0].is_active ? 0 : 1
  await db.query('UPDATE doctors SET is_active = ? WHERE id = ?', [newVal, req.params.id])
  res.json({ is_active: newVal })
}

// ─── Doctor Schedules ─────────────────────────────────────────────────────────

const getDoctorSchedules = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.params.id]
  )
  res.json(rows)
}

const saveDaySchedule = async (req, res) => {
  const { day_of_week, start_time, end_time, slot_duration_mins, is_active } = req.body
  const doctorId = req.params.id
  const [existing] = await db.query(
    'SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?',
    [doctorId, day_of_week]
  )
  if (existing.length > 0) {
    await db.query(
      'UPDATE doctor_schedules SET start_time = ?, end_time = ?, slot_duration_mins = ?, is_active = ? WHERE doctor_id = ? AND day_of_week = ?',
      [start_time, end_time, slot_duration_mins || 60, is_active ?? 1, doctorId, day_of_week]
    )
  } else {
    await db.query(
      'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [doctorId, day_of_week, start_time, end_time, slot_duration_mins || 60, is_active ?? 1]
    )
  }
  res.json({ message: 'Schedule saved.' })
}

// ─── Reports ──────────────────────────────────────────────────────────────────

const getReports = async (req, res) => {
  const months = req.query.period === '3months' ? 3 : 6
  const [monthly] = await db.query(
    `SELECT DATE_FORMAT(appointment_date, '%b') AS month,
            DATE_FORMAT(appointment_date, '%Y-%m') AS ym,
            COUNT(*) AS appointments,
            COUNT(DISTINCT patient_id) AS patients,
            SUM(clinic_type = 'derma') AS derma,
            SUM(clinic_type = 'medical') AS medical
     FROM appointments
     WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY ym, month ORDER BY ym ASC`,
    [months]
  )
  const [statusRows] = await db.query('SELECT status, COUNT(*) AS value FROM appointments GROUP BY status')
  const total = statusRows.reduce((s, r) => s + r.value, 0)

  // FIX: added color/textColor fields that Admin_Reports.jsx uses
  const colorMap = {
    completed:   { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    pending:     { color: 'bg-amber-400',   textColor: 'text-amber-600'   },
    confirmed:   { color: 'bg-sky-500',     textColor: 'text-sky-600'     },
    cancelled:   { color: 'bg-red-400',     textColor: 'text-red-500'     },
    rescheduled: { color: 'bg-violet-400',  textColor: 'text-violet-600'  },
  }
  const statusBreakdown = statusRows.map(r => ({
    label: r.status.charAt(0).toUpperCase() + r.status.slice(1),
    value: r.value,
    pct: total > 0 ? Math.round((r.value / total) * 100) : 0,
    color:     (colorMap[r.status] || { color: 'bg-slate-400' }).color,
    textColor: (colorMap[r.status] || { textColor: 'text-slate-500' }).textColor,
  }))

  const [topDoctors] = await db.query(
    `SELECT d.full_name AS name, d.specialty, d.specialty LIKE '%erm%' AS is_derma,
            COUNT(*) AS patients, SUM(a.status = 'completed') AS completed
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY d.id ORDER BY patients DESC LIMIT 5`,
    [months]
  )
  res.json({ monthly, statusBreakdown, topDoctors })
}

// ─── Inventory ────────────────────────────────────────────────────────────────

const getInventory = async (req, res) => {
  const [items] = await db.query('SELECT * FROM inventory ORDER BY category, name')
  const [logs] = await db.query(
    `SELECT l.*, i.name AS item_name, s.full_name AS staff_name
     FROM inventory_logs l
     JOIN inventory i ON l.inventory_id = i.id
     LEFT JOIN staff s ON l.staff_id = s.id
     ORDER BY l.logged_at DESC LIMIT 50`
  )
  // Both admin and staff inventory pages expect { items, logs }
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
    'INSERT INTO inventory_logs (inventory_id, type, qty, note) VALUES (?, ?, ?, ?)',
    [req.params.id, type, qty, note || null]
  )
  const [logRow] = await db.query(
    'SELECT l.*, i.name AS item_name FROM inventory_logs l JOIN inventory i ON l.inventory_id = i.id WHERE l.id = ?',
    [logResult.insertId]
  )
  res.json({ new_stock: newStock, log: logRow[0] })
}

const addInventoryItem = async (req, res) => {
  const { barcode, name, category, unit, stock, threshold, price, supplier } = req.body
  if (!barcode || !name || !category)
    return res.status(400).json({ message: 'Barcode, name, and category required.' })
  const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Barcode already exists.' })
  const [result] = await db.query(
    'INSERT INTO inventory (barcode, name, category, unit, stock, threshold, price, supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [barcode, name, category, unit || 'box', stock || 0, threshold || 5, price || 0, supplier || '']
  )
  const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
  res.status(201).json(rows[0])
}

// ─── Supply Requests ──────────────────────────────────────────────────────────

const getSupplyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*,
            i.name AS item_name, i.name AS item, i.unit, i.category,
            d.full_name AS doctor_name, d.full_name AS doctor,
            sr.qty_requested AS qty
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     JOIN doctors   d ON sr.doctor_id    = d.id
     ORDER BY sr.requested_at DESC`
  )
  res.json(rows)
}

const resolveSupplyRequest = async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' })
  await db.query('UPDATE supply_requests SET status = ? WHERE id = ?', [status, req.params.id])
  res.json({ message: `Request ${status}.` })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getStaff, createStaff, toggleStaff,
  getDoctors, createDoctor, toggleDoctor,
  getDoctorSchedules, saveDaySchedule,
  getReports,
  getInventory, updateStock, addInventoryItem,
  getSupplyRequests, resolveSupplyRequest,
}