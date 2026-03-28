// server/controllers/admin.controller.js
const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendTempPassword } = require('../utils/emailService')

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Dashboard ─────────────────────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const [[{ totalPatients }]]    = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  const [[{ todayAppts }]]       = await db.query('SELECT COUNT(*) AS todayAppts FROM appointments WHERE appointment_date = ?', [today])
  const [[{ pendingApprovals }]] = await db.query("SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE status = 'pending'")
  const [[{ lowStockCount }]]    = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= threshold')
  const [[{ activeQueue }]]      = await db.query(
    "SELECT COUNT(*) AS activeQueue FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  const [[{ totalStaff }]]   = await db.query("SELECT COUNT(*) AS totalStaff FROM staff WHERE status='active'")
  const [[{ totalDoctors }]] = await db.query("SELECT COUNT(*) AS totalDoctors FROM doctors WHERE is_active=1")
  res.json({ totalPatients, todayAppts, pendingApprovals, lowStockCount, activeQueue, totalStaff, totalDoctors })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  const { date } = req.query
  let sql = `SELECT
               a.*,
               a.appointment_date AS date,
               a.appointment_time AS time,
               a.clinic_type      AS type,
               p.full_name        AS patient,
               p.full_name        AS patient_name,
               p.email            AS patient_email,
               p.phone            AS patient_phone,
               p.birthdate        AS patient_birthdate,
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

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time, reason, notes } = req.body
  if (!appointment_date || !appointment_time)
    return res.status(400).json({ message: 'New date and time are required.' })
  const [rows] = await db.query('SELECT id FROM appointments WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  await db.query(
    "UPDATE appointments SET appointment_date=?, appointment_time=?, reason=COALESCE(?,reason), notes=COALESCE(?,notes), status='rescheduled', updated_at=NOW() WHERE id=?",
    [appointment_date, appointment_time, reason || null, notes || null, req.params.id]
  )
  res.json({ message: 'Appointment rescheduled.' })
}

const createAppointment = async (req, res) => {
  const { patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes } = req.body
  if (!patient_id || !doctor_id || !clinic_type || !appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Missing required fields.' })
  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes, status) VALUES (?,?,?,?,?,?,?,?)',
    [patient_id, doctor_id, clinic_type, reason || null, appointment_date, appointment_time, notes || null, 'pending']
  )
  const [[appt]] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time, a.clinic_type AS type,
            p.full_name AS patient, p.full_name AS patient_name, p.email AS patient_email,
            p.phone AS patient_phone, p.birthdate AS patient_birthdate, p.sex AS patient_sex,
            p.address AS patient_address, d.full_name AS doctor, d.specialty
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors  d ON a.doctor_id  = d.id
     WHERE a.id = ?`,
    [result.insertId]
  )
  res.status(201).json(appt)
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const getQueue = async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const [rows] = await db.query(
    `SELECT q.*, q.queue_number AS queueNo, q.patient_name AS patient,
            d.full_name AS doctor, TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ? ORDER BY q.queue_number ASC`,
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

// ── Patients ──────────────────────────────────────────────────────────────────

const getPatients = async (req, res) => {
  const { search } = req.query
  let sql = `SELECT p.id, p.full_name AS name, p.email, p.phone, p.birthdate, p.sex,
               p.civil_status AS civilStatus, p.address,
               TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS age,
               (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND status = 'completed') AS totalVisits,
               (SELECT DATE_FORMAT(MAX(appointment_date),'%b %d, %Y') FROM appointments WHERE patient_id = p.id AND status='completed') AS lastVisit
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
            (SELECT COUNT(*) FROM appointments WHERE patient_id=p.id AND status='completed') AS totalVisits,
            (SELECT DATE_FORMAT(MAX(appointment_date),'%b %d, %Y') FROM appointments WHERE patient_id=p.id AND status='completed') AS lastVisit
     FROM patients p WHERE p.id = ?`, [id]
  )
  if (!patient) return res.status(404).json({ message: 'Patient not found.' })
  const [history] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time, a.clinic_type AS type,
            d.full_name AS doctor, c.diagnosis, c.prescription, c.notes
     FROM appointments a JOIN doctors d ON a.doctor_id=d.id
     LEFT JOIN consultations c ON c.appointment_id=a.id
     WHERE a.patient_id=? AND a.status IN ('completed','cancelled') ORDER BY a.appointment_date DESC`, [id]
  )
  const [upcoming] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time, a.clinic_type AS type, d.full_name AS doctor
     FROM appointments a JOIN doctors d ON a.doctor_id=d.id
     WHERE a.patient_id=? AND a.status IN ('pending','confirmed') ORDER BY a.appointment_date ASC`, [id]
  )
  res.json({ patient, history, upcoming })
}

// ── Staff ─────────────────────────────────────────────────────────────────────

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
    'INSERT INTO staff (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [full_name, email, phone || null, hashed, 'staff', 'active']
  )
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?', [result.insertId])
  try {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/staff/login`
    await sendTempPassword(email, full_name, 'Staff', tempPassword, loginUrl)
  } catch (err) {
    console.error('⚠️ Staff email failed:', err.message)
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

// ── Doctors ───────────────────────────────────────────────────────────────────

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS name, full_name, email, phone, specialty, is_active, created_at,
            CASE WHEN specialty LIKE '%erm%' THEN 'derma' ELSE 'medical' END AS type
     FROM doctors ORDER BY full_name`
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
    'SELECT id, full_name, email, phone, specialty, is_active, created_at FROM doctors WHERE id = ?', [result.insertId]
  )
  try {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/doctor/login`
    await sendTempPassword(email, full_name, 'Doctor', tempPassword, loginUrl)
  } catch (err) {
    console.error('⚠️ Doctor email failed:', err.message)
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

// ── Doctor Schedules ──────────────────────────────────────────────────────────

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
    'SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [doctorId, day_of_week]
  )
  if (existing.length > 0) {
    await db.query(
      'UPDATE doctor_schedules SET start_time=?, end_time=?, slot_duration_mins=?, is_active=? WHERE doctor_id=? AND day_of_week=?',
      [start_time, end_time, slot_duration_mins || 60, is_active ?? 1, doctorId, day_of_week]
    )
  } else {
    await db.query(
      'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active) VALUES (?,?,?,?,?,?)',
      [doctorId, day_of_week, start_time, end_time, slot_duration_mins || 60, is_active ?? 1]
    )
  }
  res.json({ message: 'Schedule saved.' })
}

// ── Reports ───────────────────────────────────────────────────────────────────

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
            COUNT(*) AS patients, SUM(a.status='completed') AS completed
     FROM appointments a JOIN doctors d ON a.doctor_id=d.id
     WHERE a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY d.id ORDER BY patients DESC LIMIT 5`,
    [months]
  )
  // Inventory stats
  const [[inventoryStats]] = await db.query(
    `SELECT COUNT(*) AS total_items,
            SUM(stock * price) AS total_value,
            SUM(CASE WHEN stock=0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN stock>0 AND stock<=threshold THEN 1 ELSE 0 END) AS low_stock
     FROM inventory`
  )
  // Monthly stock activity
  const [stockActivity] = await db.query(
    `SELECT DATE_FORMAT(logged_at,'%b') AS month,
            DATE_FORMAT(logged_at,'%Y-%m') AS ym,
            SUM(CASE WHEN type='in'  THEN qty ELSE 0 END) AS stock_in,
            SUM(CASE WHEN type='out' THEN qty ELSE 0 END) AS stock_out
     FROM inventory_logs
     WHERE logged_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
     GROUP BY ym, month ORDER BY ym ASC`,
    [months]
  )
  res.json({ monthly, statusBreakdown, topDoctors, inventoryStats, stockActivity })
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getInventory = async (req, res) => {
  const [items] = await db.query('SELECT * FROM inventory ORDER BY category, name')
  const [logs]  = await db.query(
    `SELECT l.*, i.name AS item_name, s.full_name AS staff_name
     FROM inventory_logs l
     JOIN inventory i ON l.inventory_id = i.id
     LEFT JOIN staff s ON l.staff_id = s.id
     ORDER BY l.logged_at DESC`
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
    'INSERT INTO inventory_logs (inventory_id, type, qty, note) VALUES (?, ?, ?, ?)',
    [req.params.id, type, qty, note || null]
  )
  const [[log]] = await db.query(
    'SELECT l.*, i.name AS item_name FROM inventory_logs l JOIN inventory i ON l.inventory_id=i.id WHERE l.id=?',
    [logResult.insertId]
  )
  res.json({ new_stock: newStock, log })
}

const addInventoryItem = async (req, res) => {
  const { barcode, name, category, unit, stock, threshold, price, supplier } = req.body
  if (!barcode || !name || !category)
    return res.status(400).json({ message: 'Barcode, name, and category are required.' })
  const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
  if (existing.length > 0)
    return res.status(409).json({ message: 'An item with that barcode already exists.' })
  const [result] = await db.query(
    'INSERT INTO inventory (barcode, name, category, unit, stock, threshold, price, supplier) VALUES (?,?,?,?,?,?,?,?)',
    [barcode, name, category, unit || 'box', stock || 0, threshold || 5, price || 0, supplier || '']
  )
  const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
  res.status(201).json(rows[0])
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
  getDashboard,
  getAppointments, confirmAppointment, cancelAppointment, rescheduleAppointment, createAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getStaff, createStaff, toggleStaff,
  getDoctors, createDoctor, toggleDoctor,
  getDoctorSchedules, saveDaySchedule,
  getReports,
  getInventory, updateStock, addInventoryItem,
  getSupplyRequests, resolveSupplyRequest,
}