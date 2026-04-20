// server/controllers/staff.controller.js
// FIX 1: getDoctors now returns the 'type' field so Walk-in Queue doctor filter works
// FIX 2: Added updateInventoryItem and deleteInventoryItem
// FIX 3: getPatients returns 'name' alias so AddModal dropdown shows patient names

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendAppointmentStatusEmail } = require('../utils/emailService')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments, syncInventoryBaseStock } = require('../utils/appointments')
const { broadcast } = require('../utils/sse')

const makeTempPassword = () => Math.random().toString(36).slice(-8)
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const getTodayDateOnly = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const normalizeInventoryPayload = (body = {}) => ({
  barcode: body.barcode?.trim() || null,
  name: body.name?.trim() || '',
  category: body.category?.trim() || '',
  unit: body.unit?.trim() || 'box',
  base_unit: body.base_unit?.trim() || body.unit?.trim() || 'box',
  unit_size: Math.max(1, Number(body.unit_size) || 1),
  stock: Math.max(0, Number(body.stock) || 0),
  threshold: Math.max(0, Number(body.threshold) || 0),
  price: Math.max(0, Number(body.price) || 0),
  supplier: body.supplier?.trim() || null,
  expiration_date: body.expiration_date || null,
  storage_location: body.storage_location?.trim() || null,
})

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
    user: { id: staff.id, full_name: staff.full_name, email: staff.email, role: 'staff', theme_preference: staff.theme_preference, profile_image_url: staff.profile_image_url },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['staff_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'staff') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query(
      "SELECT id, full_name, email, theme_preference, profile_image_url FROM staff WHERE id = ? AND status = 'active'", [decoded.id]
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
  const [[{ totalToday }]]    = await db.query(
    'SELECT COUNT(*) AS totalToday FROM appointments WHERE appointment_date = ?', [today]
  )
  const [[{ pendingCount }]]  = await db.query(
    "SELECT COUNT(*) AS pendingCount FROM appointments WHERE status = 'pending'"
  )
  const [[{ queueCount }]]    = await db.query(
    "SELECT COUNT(*) AS queueCount FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  const [[{ lowStock }]]      = await db.query(
    'SELECT COUNT(*) AS lowStock FROM inventory WHERE stock <= threshold'
  )
  const [[{ totalPatients }]] = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  res.json({ totalToday, pendingCount, queueCount, lowStock, totalPatients })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  await markOverdueAppointments()
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
  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate))
    return res.status(400).json({ message: 'Invalid appointment date.' })
  if (normalizedDate < getTodayDateOnly())
    return res.status(400).json({ message: 'Cannot create an appointment in the past.' })
  await markOverdueAppointments()

  const [activeWithDoctor] = await db.query(
    `SELECT id
     FROM appointments
     WHERE patient_id = ? AND doctor_id = ?
       AND status IN ('pending','confirmed','rescheduled','in-progress')
     LIMIT 1`,
    [patient_id, doctor_id]
  )
  if (activeWithDoctor.length > 0) {
    return res.status(409).json({
      message: 'This patient already has an active appointment with this doctor.',
    })
  }

  const [existing] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id=? AND appointment_date=? AND appointment_time=?
     AND status IN ('pending','confirmed','rescheduled','in-progress')`,
    [doctor_id, normalizedDate, appointment_time]
  )
  if (existing.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes) VALUES (?,?,?,?,?,?,?)',
    [patient_id, doctor_id, clinic_type, reason || null, normalizedDate, appointment_time, notes || null]
  )
  const [rows] = await db.query(
    `SELECT p.full_name AS patient_name, d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [result.insertId]
  )
  await notifyRoles(['admin', 'staff'], {
    type: 'appointment_booked',
    title: 'New patient booking',
    message: `${rows[0].patient_name} booked an appointment with ${rows[0].doctor_name} on ${normalizedDate} at ${appointment_time}.`,
    reference_type: 'appointment',
    reference_id: result.insertId,
  })
  broadcast(['admin', 'staff'], 'appointment_updated', { appointmentId: result.insertId, status: 'pending' })
  res.status(201).json({ message: 'Appointment created.', id: result.insertId })
}

const confirmAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_confirmed',
    title: 'Appointment confirmed',
    message: `Your appointment with ${rows[0].doctor_name} has been confirmed.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await sendAppointmentStatusEmail({
    to: rows[0].patient_email,
    patient_name: rows[0].patient_name,
    doctor_name: rows[0].doctor_name,
    appointment_date: rows[0].appointment_date,
    appointment_time: rows[0].appointment_time,
    clinic_type: rows[0].clinic_type,
    status: 'confirmed',
  }).catch(() => {})
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'confirmed' })
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_cancelled',
    title: 'Appointment cancelled',
    message: `Your appointment with ${rows[0].doctor_name} has been cancelled.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await sendAppointmentStatusEmail({
    to: rows[0].patient_email,
    patient_name: rows[0].patient_name,
    doctor_name: rows[0].doctor_name,
    appointment_date: rows[0].appointment_date,
    appointment_time: rows[0].appointment_time,
    clinic_type: rows[0].clinic_type,
    status: 'cancelled',
  }).catch(() => {})
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'cancelled' })
  res.json({ message: 'Appointment cancelled.' })
}

const markAppointmentNoShow = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.status, p.id AS patient_id
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  if (!['confirmed', 'rescheduled'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only confirmed or rescheduled appointments can be marked as no show.' })
  }
  await db.query("UPDATE appointments SET status = 'no_show' WHERE id = ?", [req.params.id])
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_no_show',
    title: 'Appointment marked as no show',
    message: 'Your appointment was marked as no show.',
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'no_show' })
  res.json({ message: 'Appointment marked as no show.' })
}

const rescheduleAppointment = async (req, res) => {
  const { appointment_date, appointment_time } = req.body
  if (!appointment_date || !appointment_time)
    return res.status(400).json({ message: 'Date and time required.' })
  const normalizedDate = toDateOnly(appointment_date)
  if (!isValidDateOnly(normalizedDate))
    return res.status(400).json({ message: 'Invalid appointment date.' })
  if (normalizedDate < getTodayDateOnly())
    return res.status(400).json({ message: 'Cannot reschedule to a past date.' })
  await markOverdueAppointments()
  const [rows] = await db.query(
    `SELECT a.id, a.doctor_id, a.status, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  if (!['pending', 'confirmed', 'rescheduled'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending, confirmed, or rescheduled appointments can be rescheduled.' })
  }

  const [conflict] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id=? AND appointment_date=? AND appointment_time=?
     AND status IN ('pending','confirmed','rescheduled','in-progress') AND id != ?`,
    [rows[0].doctor_id, normalizedDate, appointment_time, req.params.id]
  )
  if (conflict.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  await db.query(
    "UPDATE appointments SET appointment_date=?, appointment_time=?, status='pending' WHERE id=?",
    [normalizedDate, appointment_time, req.params.id]
  )
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_rescheduled',
    title: 'Appointment rescheduled',
    message: `Your appointment with ${rows[0].doctor_name} was moved to ${normalizedDate} at ${appointment_time} and is pending confirmation.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await sendAppointmentStatusEmail({
    to: rows[0].patient_email,
    patient_name: rows[0].patient_name,
    doctor_name: rows[0].doctor_name,
    appointment_date: normalizedDate,
    appointment_time,
    clinic_type: rows[0].clinic_type,
    status: 'rescheduled',
  }).catch(() => {})
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'pending' })
  res.json({ message: 'Appointment rescheduled and set to pending confirmation.' })
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
  broadcast(['admin', 'staff'], 'queue_updated', { queueId: result.insertId, status: 'added', doctorId: Number(doctor_id) })
  if (doctor_id) broadcast([`doctor_${doctor_id}`], 'queue_updated', { queueId: result.insertId, status: 'added', doctorId: Number(doctor_id) })
  res.status(201).json({ id: result.insertId, queue_number: maxQ + 1 })
}

const updateQueueStatus = async (req, res) => {
  const { status } = req.body
  if (!['waiting','in-progress','done','removed'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' })
  const [rows] = await db.query('SELECT id, doctor_id FROM queue WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Queue entry not found.' })
  await db.query('UPDATE queue SET status=? WHERE id=?', [status, req.params.id])
  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`], 'queue_updated', { queueId: Number(req.params.id), status, doctorId: rows[0].doctor_id })
  res.json({ message: 'Queue updated.' })
}

// ── Patients ──────────────────────────────────────────────────────────────────

const getPatients = async (req, res) => {
  const search = req.query.search || ''
  const [rows] = await db.query(
    // FIX 3: return both 'name' and 'full_name' so modal dropdown uses p.name correctly
    `SELECT id, full_name AS name, full_name, email, phone, sex, birthdate, address, civil_status, created_at
     FROM patients
     WHERE full_name LIKE ? OR email LIKE ?
     ORDER BY full_name`,
    [`%${search}%`, `%${search}%`]
  )
  res.json(rows)
}

const createWalkInPatient = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, consent_given } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address)
    return res.status(400).json({ message: 'Missing required patient fields.' })
  if (!consent_given)
    return res.status(400).json({ message: 'Data privacy consent is required.' })

  if (email) {
    const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
    if (existing.length > 0) return res.status(409).json({ message: 'A patient with that email already exists.' })
  }

  const tempPassword = makeTempPassword()
  const hashedPassword = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    `INSERT INTO patients
      (full_name, birthdate, sex, civil_status, phone, address, email, password, is_walk_in, consent_given, consent_given_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      full_name,
      birthdate,
      sex,
      civil_status || null,
      phone,
      address,
      email || null,
      hashedPassword,
      consent_given ? 1 : 0,
      consent_given ? new Date() : null,
    ]
  )

  if (consent_given) {
    await db.query(
      'INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)',
      [result.insertId, 'data_processing', req.ip || null]
    )
  }

  res.status(201).json({ id: result.insertId, full_name })
}

const getPatientRecord = async (req, res) => {
  const [pRows] = await db.query(
    `SELECT id, full_name, email, phone, sex,
            DATE_FORMAT(birthdate, '%Y-%m-%d') AS birthdate,
            address, civil_status, created_at
     FROM patients WHERE id = ?`,
    [req.params.id]
  )
  if (pRows.length === 0) return res.status(404).json({ message: 'Patient not found.' })
  const patient = pRows[0]

  const [history] = await db.query(
    `SELECT a.*,
            DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,
            a.appointment_time                          AS time,
            a.clinic_type                               AS type,
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

const getInventory = async (req, res) => {
  const [items] = await db.query(
    `SELECT * FROM inventory
     ORDER BY
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       category ASC,
       name ASC`
  )
  res.json(items)
}

const addInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier,
    expiration_date, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })

  if (barcode) {
    const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
    if (existing.length > 0)
      return res.status(409).json({ message: 'An item with that barcode already exists.' })
  }

  try {
    const [result] = await db.query(
      `INSERT INTO inventory
       (barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location]
    )
    await syncInventoryBaseStock(result.insertId)
    const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
    return res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  }
}

// FIX 2: Edit inventory item (name, barcode, category, unit, threshold, price, supplier)
const updateInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, threshold, price, supplier,
    expiration_date, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })
  const [rows] = await db.query('SELECT id FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })
  try {
    await db.query(
      `UPDATE inventory
       SET barcode=?, name=?, category=?, unit=?, base_unit=?, unit_size=?, threshold=?, price=?, supplier=?, expiration_date=?, storage_location=?
       WHERE id=?`,
      [barcode, name, category, unit, base_unit, unit_size, threshold, price, supplier, expiration_date, storage_location, req.params.id]
    )
    await syncInventoryBaseStock(req.params.id)
    const [updated] = await db.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  }
}

// FIX 2: Delete inventory item
const deleteInventoryItem = async (req, res) => {
  const [rows] = await db.query('SELECT id FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })
  await db.query('DELETE FROM inventory WHERE id = ?', [req.params.id])
  res.json({ message: 'Item deleted.' })
}

const updateStock = async (req, res) => {
  const { type, qty, note } = req.body
  if (!type || !qty)
    return res.status(400).json({ message: 'type and qty are required.' })
  const [rows] = await db.query('SELECT id, stock, stock_base, unit_size FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })

  const unitSize = Number(rows[0].unit_size) > 0 ? Number(rows[0].unit_size) : 1
  const currentBase = Number(rows[0].stock_base ?? rows[0].stock * unitSize)
  const deltaBase = Number(qty) * unitSize
  const newBase = type === 'in' ? currentBase + deltaBase : Math.max(0, currentBase - deltaBase)
  const newStock = newBase / unitSize
  await db.query('UPDATE inventory SET stock=?, stock_base=? WHERE id=?', [newStock, newBase, req.params.id])
  await db.query(
    'INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note) VALUES (?,?,?,?,?)',
    [req.params.id, req.user.id, type, qty, note || null]
  )
  res.json({ new_stock: newStock })
}

// ── Doctors list ──────────────────────────────────────────────────────────────

// FIX 1: Added 'type' computed column so AddWalkInModal filter works
const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    `SELECT
       id,
       full_name AS name,
       full_name,
       specialty,
       is_active,
       CASE WHEN specialty LIKE '%erm%' THEN 'derma' ELSE 'medical' END AS type
     FROM doctors
     WHERE is_active = 1
     ORDER BY full_name`
  )
  res.json(rows)
}

const getDoctorSchedules = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.params.id]
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
    const [[item]] = await db.query(
      'SELECT stock, stock_base, unit_size FROM inventory WHERE id = ?',
      [rows[0].inventory_id]
    )
    const unitSize = Number(item?.unit_size) > 0 ? Number(item.unit_size) : 1
    const currentBase = Number(item?.stock_base ?? Number(item?.stock || 0) * unitSize)
    const deltaBase = Number(rows[0].qty_requested) * unitSize
    const newBase = Math.max(0, currentBase - deltaBase)
    const newStock = newBase / unitSize
    await db.query(
      'UPDATE inventory SET stock = ?, stock_base = ? WHERE id = ?',
      [newStock, newBase, rows[0].inventory_id]
    )
    await db.query(
      'INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note) VALUES (?,?,?,?,?)',
      [rows[0].inventory_id, req.user.id, 'out', rows[0].qty_requested, 'Supply request approved']
    )
  }

  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`], 'supply_request_resolved', {
    requestId: Number(req.params.id),
    status,
    doctorId: rows[0].doctor_id,
  })
  res.json({ message: `Request ${status}.` })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard,
  getAppointments, createAppointment, confirmAppointment, cancelAppointment, markAppointmentNoShow, rescheduleAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord, createWalkInPatient,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock,
  getDoctors, getDoctorSchedules,
  getSupplyRequests, resolveSupplyRequest,
}
