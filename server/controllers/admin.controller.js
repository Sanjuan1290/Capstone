// server/controllers/admin.controller.js
// FIXES:
// 1. getDashboard → now returns doctorStatus (Doctors Today was always empty)
// 2. getDashboard → removed fake "revenue" field; dashboard stat is now real
// 3. getDoctors / createDoctor → support prc_license column (run migration first)
// 4. getReports → now returns inventoryStats so Reports page shows real numbers
// 5. NEW: updateInventoryItem (PUT /inventory/:id) — edit a product
// 6. NEW: deleteInventoryItem (DELETE /inventory/:id) — remove a product

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendTempPassword, sendAppointmentStatusEmail } = require('../utils/emailService')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments, syncInventoryBaseStock } = require('../utils/appointments')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly, getCurrentTimeLabel } = require('../utils/date')
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const DOCTOR_SPECIALTIES = new Set(['Dermatologist', 'General Medicine'])

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

const makeTempPassword = () => Math.random().toString(36).slice(-8)

const normalizePatientPayload = (body = {}) => ({
  full_name: body.full_name?.trim() || '',
  birthdate: body.birthdate || '',
  sex: body.sex?.trim() || '',
  civil_status: body.civil_status?.trim() || null,
  phone: body.phone?.trim() || '',
  address: body.address?.trim() || '',
  email: body.email?.trim() || null,
  consent_given: Boolean(body.consent_given),
})

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
    user: { id: admin.id, full_name: admin.full_name, email: admin.email, role: 'admin', theme_preference: admin.theme_preference, profile_image_url: admin.profile_image_url },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['admin_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') return res.status(200).json({ authenticated: false })
    const [rows] = await db.query('SELECT id, full_name, email, theme_preference, profile_image_url FROM admins WHERE id = ?', [decoded.id])
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
  const today = getTodayDateOnly()

  const [[{ totalPatients }]]    = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  const [[{ todayAppts }]]       = await db.query('SELECT COUNT(*) AS todayAppts FROM appointments WHERE appointment_date = ?', [today])
  const [[{ pendingApprovals }]] = await db.query("SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE status = 'pending'")
  const [[{ lowStockCount }]]    = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE stock <= threshold')
  const [[{ activeQueue }]]      = await db.query(
    "SELECT COUNT(*) AS activeQueue FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')", [today]
  )
  const [[{ totalStaff }]]   = await db.query("SELECT COUNT(*) AS totalStaff FROM staff WHERE status='active'")
  const [[{ totalDoctors }]] = await db.query("SELECT COUNT(*) AS totalDoctors FROM doctors WHERE is_active=1")

  // FIX 1: Build doctorStatus — doctors who have appointments today (on-duty)
  // plus all active doctors so the dashboard can show who is off-duty too.
  const [onDutyRows] = await db.query(
    `SELECT
       d.id,
       d.full_name                    AS name,
       d.specialty,
       COUNT(a.id)                    AS patients,
       SUM(a.status = 'completed')    AS done,
       'on-duty'                      AS status
     FROM doctors d
     JOIN appointments a ON a.doctor_id = d.id
     WHERE a.appointment_date = ?
       AND a.status NOT IN ('cancelled','rescheduled')
       AND d.is_active = 1
     GROUP BY d.id`,
    [today]
  )

  const onDutyIds = new Set(onDutyRows.map(r => r.id))

  const [allDoctors] = await db.query(
    'SELECT id, full_name AS name, specialty FROM doctors WHERE is_active = 1 ORDER BY full_name'
  )

  const doctorStatus = allDoctors.map(doc => {
    const onDuty = onDutyRows.find(r => r.id === doc.id)
    return onDuty
      ? { ...onDuty }
      : { id: doc.id, name: doc.name, specialty: doc.specialty, patients: 0, done: 0, status: 'off-duty' }
  })

  res.json({
    totalPatients,
    todayAppts,
    pendingApprovals,
    lowStockCount,
    activeQueue,
    totalStaff,
    totalDoctors,
    doctorStatus,          // FIX 1: populated
  })
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
               p.full_name        AS patient,
               p.full_name        AS patient_name,
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

const confirmAppointment = async (req, res) => {
  const { id } = req.params
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [id])
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_confirmed',
    title: 'Appointment confirmed',
    message: `Your appointment with ${rows[0].doctor_name} has been confirmed.`,
    reference_type: 'appointment',
    reference_id: id,
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
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(id), status: 'confirmed' })
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
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
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
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
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed', 'rescheduled'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending, confirmed, or rescheduled appointments can be rescheduled.' })
  }

  const [conflict] = await db.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
     AND status IN ('pending','confirmed','rescheduled','in-progress') AND id != ?`,
    [rows[0].doctor_id, normalizedDate, appointment_time, req.params.id]
  )
  if (conflict.length > 0)
    return res.status(409).json({ message: 'That time slot is already taken.' })

  await db.query(
    "UPDATE appointments SET appointment_date=?, appointment_time=?, status='confirmed' WHERE id=?",
    [normalizedDate, appointment_time, req.params.id]
  )
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_rescheduled',
    title: 'Appointment rescheduled',
    message: `Your appointment with ${rows[0].doctor_name} was moved to ${normalizedDate} at ${appointment_time}.`,
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
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'confirmed' })
  res.json({ message: 'Appointment rescheduled.' })
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

// ── Queue ─────────────────────────────────────────────────────────────────────

const getQueue = async (req, res) => {
  const today = req.query.date || getTodayDateOnly()
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
  const { patient_id, doctor_id, patient_name, type, reason } = req.body
  if (!doctor_id || !type)
    return res.status(400).json({ message: 'doctor_id and type are required.' })

  const today = getTodayDateOnly()
  const [[{ maxQ }]] = await db.query(
    'SELECT COALESCE(MAX(queue_number), 0) AS maxQ FROM queue WHERE queue_date = ?', [today]
  )
  let appointmentId = null

  if (patient_id) {
    const appointmentTime = getCurrentTimeLabel()
    const [appointmentResult] = await db.query(
      `INSERT INTO appointments
       (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, status)
       VALUES (?,?,?,?,?,?, 'confirmed')`,
      [patient_id, doctor_id, type, reason || 'Walk-in consultation', today, appointmentTime]
    )
    appointmentId = appointmentResult.insertId
  }

  const [result] = await db.query(
    'INSERT INTO queue (patient_id, doctor_id, queue_number, patient_name, type, status, queue_date, appointment_id) VALUES (?,?,?,?,?,?,?,?)',
    [patient_id || null, doctor_id, maxQ + 1, patient_name || 'Walk-in', type, 'waiting', today, appointmentId]
  )
  broadcast(['admin', 'staff', `doctor_${doctor_id}`], 'queue_updated', { queueId: result.insertId, status: 'added', doctorId: Number(doctor_id) })
  if (appointmentId) {
    broadcast(['admin', 'staff', `doctor_${doctor_id}`], 'appointment_updated', { appointmentId, status: 'confirmed' })
  }
  res.status(201).json({ id: result.insertId, queue_number: maxQ + 1, appointment_id: appointmentId })
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
    `SELECT id, full_name AS name, full_name, email, phone, sex, birthdate, address, civil_status, created_at
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
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled','no_show')
     ORDER BY a.appointment_date DESC`,
    [req.params.id]
  )

  const [upcoming] = await db.query(
    `SELECT a.*, DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,
            d.full_name AS doctor_name, d.specialty
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = ? AND a.status IN ('pending','confirmed')
     ORDER BY a.appointment_date ASC`,
    [req.params.id]
  )

  res.json({ patient, history, upcoming })
}

const createWalkInPatient = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, consent_given } = normalizePatientPayload(req.body)

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
      civil_status,
      phone,
      address,
      email,
      hashedPassword,
      1,
      new Date(),
    ]
  )

  await db.query(
    'INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)',
    [result.insertId, 'data_processing', req.ip || null]
  )

  res.status(201).json({ id: result.insertId, full_name, email, phone })
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

const updateStaff = async (req, res) => {
  const { full_name, email, phone } = req.body
  if (!full_name || !email)
    return res.status(400).json({ message: 'Name and email are required.' })

  const [rows] = await db.query('SELECT id, email FROM staff WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Staff account not found.' })

  const [existing] = await db.query('SELECT id FROM staff WHERE email = ? AND id <> ?', [email, req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another staff account.' })

  await db.query(
    'UPDATE staff SET full_name = ?, email = ?, phone = ? WHERE id = ?',
    [full_name.trim(), email.trim(), phone?.trim() || null, req.params.id]
  )
  const [updated] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?', [req.params.id])
  res.json(updated[0])
}

// ── Doctors ───────────────────────────────────────────────────────────────────

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    // FIX 3: return prc_license (requires migration_add_prc_license.sql)
    `SELECT id, full_name AS name, full_name, email, phone, specialty, prc_license, is_active, created_at,
            CASE WHEN specialty LIKE '%erm%' THEN 'derma' ELSE 'medical' END AS type
     FROM doctors ORDER BY full_name`
  )
  res.json(rows)
}

const createDoctor = async (req, res) => {
  const { full_name, email, phone, specialty, prc_license } = req.body
  if (!full_name || !email)
    return res.status(400).json({ message: 'Name and email are required.' })
  if (!DOCTOR_SPECIALTIES.has(specialty))
    return res.status(400).json({ message: 'Specialty must be Dermatologist or General Medicine.' })
  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })
  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
  const hashed = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    // FIX 3: save prc_license (requires migration_add_prc_license.sql)
    'INSERT INTO doctors (full_name, email, phone, specialty, prc_license, password) VALUES (?, ?, ?, ?, ?, ?)',
    [full_name, email, phone || null, specialty || null, prc_license || null, hashed]
  )
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, specialty, prc_license, is_active, created_at FROM doctors WHERE id = ?', [result.insertId]
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

const updateDoctor = async (req, res) => {
  const { full_name, email, phone, specialty, prc_license } = req.body
  if (!full_name || !email)
    return res.status(400).json({ message: 'Name and email are required.' })
  if (!DOCTOR_SPECIALTIES.has(specialty))
    return res.status(400).json({ message: 'Specialty must be Dermatologist or General Medicine.' })

  const [rows] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Doctor account not found.' })

  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ? AND id <> ?', [email, req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another doctor account.' })

  await db.query(
    'UPDATE doctors SET full_name = ?, email = ?, phone = ?, specialty = ?, prc_license = ? WHERE id = ?',
    [full_name.trim(), email.trim(), phone?.trim() || null, specialty?.trim() || null, prc_license?.trim() || null, req.params.id]
  )
  const [updated] = await db.query(
    'SELECT id, full_name, email, phone, specialty, prc_license, is_active, created_at FROM doctors WHERE id = ?',
    [req.params.id]
  )
  res.json(updated[0])
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
  const [statusRows] = await db.query(
    `SELECT status, COUNT(*) AS value
     FROM appointments
     WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY status`,
    [months]
  )
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

  // FIX 4: Add real inventory stats so Reports page shows correct numbers
  const [[inventoryStats]] = await db.query(
    `SELECT
       COUNT(*)                                         AS total_items,
       SUM(stock * COALESCE(price, 0))                 AS total_value,
       SUM(stock = 0)                                  AS out_of_stock,
       SUM(stock > 0 AND stock <= threshold)           AS low_stock,
       SUM(expiration_date IS NOT NULL AND expiration_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_soon
     FROM inventory`
  )

  const [stockActivity] = await db.query(
    `SELECT DATE_FORMAT(logged_at, '%b') AS month,
            DATE_FORMAT(logged_at, '%Y-%m') AS ym,
            SUM(type = 'in') AS stock_in_actions,
            SUM(type = 'out') AS stock_out_actions,
            SUM(CASE WHEN type = 'in' THEN qty ELSE 0 END) AS stock_in,
            SUM(CASE WHEN type = 'out' THEN qty ELSE 0 END) AS stock_out
     FROM inventory_logs
     WHERE logged_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY ym, month
     ORDER BY ym ASC`,
    [months]
  )

  const [inventoryByCategory] = await db.query(
    `SELECT category,
            COUNT(*) AS items,
            SUM(stock) AS total_stock,
            SUM(stock * COALESCE(price, 0)) AS total_value
     FROM inventory
     GROUP BY category
     ORDER BY total_value DESC, category ASC`
  )

  const [[upcomingAppointments]] = await db.query(
    `SELECT COUNT(*) AS value
     FROM appointments
     WHERE appointment_date >= CURDATE()
       AND status IN ('pending', 'confirmed', 'rescheduled')`
  )

  const [[supplyRequests]] = await db.query(
    `SELECT
       SUM(status = 'pending')  AS pending,
       SUM(status = 'approved') AS approved,
       SUM(status = 'rejected') AS rejected
     FROM supply_requests
     WHERE requested_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)`,
    [months]
  )

  res.json({
    monthly,
    statusBreakdown,
    topDoctors,
    inventoryStats,
    stockActivity,
    inventoryByCategory,
    upcomingAppointments: Number(upcomingAppointments?.value || 0),
    supplyRequests: {
      pending: Number(supplyRequests?.pending || 0),
      approved: Number(supplyRequests?.approved || 0),
      rejected: Number(supplyRequests?.rejected || 0),
    },
  })
}

const getInventoryLogs = async (req, res) => {
  const [rows] = await db.query(
    `SELECT il.*, i.name AS item_name,
            COALESCE(s.full_name, a.full_name, 'System') AS performed_by,
            CASE
              WHEN il.admin_id IS NOT NULL THEN 'Admin'
              WHEN il.staff_id IS NOT NULL THEN 'Staff'
              ELSE 'System'
            END AS performed_by_role
     FROM inventory_logs il
     LEFT JOIN inventory i ON il.inventory_id = i.id
     LEFT JOIN staff s ON il.staff_id = s.id
     LEFT JOIN admins a ON il.admin_id = a.id
     ORDER BY il.logged_at DESC
     LIMIT 100`
  )
  res.json(rows)
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getInventory = async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM inventory
     ORDER BY
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       name ASC`
  )
  res.json(rows)
}

const addInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier,
    expiration_date, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })
  try {
    const [result] = await db.query(
      `INSERT INTO inventory
       (barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location]
    )
    await syncInventoryBaseStock(result.insertId)
    await db.query(
      'INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note) VALUES (?,?,?,?,?)',
      [result.insertId, req.user.id, 'create', stock, `Created inventory item${barcode ? ` with barcode ${barcode}` : ''}`]
    )
    const [rows] = await db.query('SELECT * FROM inventory WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  }
}

// FIX 5: Edit an existing inventory item
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
    const [currentRows] = await db.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
    await db.query(
      `UPDATE inventory
       SET barcode=?, name=?, category=?, unit=?, base_unit=?, unit_size=?, threshold=?, price=?, supplier=?, expiration_date=?, storage_location=?
       WHERE id=?`,
      [barcode, name, category, unit, base_unit, unit_size, threshold, price, supplier, expiration_date, storage_location, req.params.id]
    )
    await syncInventoryBaseStock(req.params.id)
    const previous = currentRows[0]
    const changeNotes = [
      previous?.barcode !== barcode ? `barcode: ${previous?.barcode || 'none'} -> ${barcode || 'none'}` : null,
      previous?.name !== name ? `name: ${previous?.name || 'none'} -> ${name}` : null,
      previous?.storage_location !== storage_location ? `location: ${previous?.storage_location || 'none'} -> ${storage_location || 'none'}` : null,
      String(previous?.expiration_date || '') !== String(expiration_date || '') ? `expiry: ${previous?.expiration_date || 'none'} -> ${expiration_date || 'none'}` : null,
    ].filter(Boolean).join('; ')
    await db.query(
      'INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, 'update', 0, changeNotes || 'Updated inventory item details']
    )
    const [updated] = await db.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  }
}

// FIX 5: Delete an inventory item
const deleteInventoryItem = async (req, res) => {
  const [rows] = await db.query('SELECT id, name, stock FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })
  await db.query(
    'INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note) VALUES (?,?,?,?,?)',
    [req.params.id, req.user.id, 'delete', rows[0].stock || 0, `Deleted inventory item ${rows[0].name}`]
  )
  await db.query('DELETE FROM inventory WHERE id = ?', [req.params.id])
  res.json({ message: 'Item deleted.' })
}

const updateStock = async (req, res) => {
  const { type, qty, note } = req.body
  if (!type || !qty)
    return res.status(400).json({ message: 'type and qty required.' })
  const [rows] = await db.query('SELECT id, stock, stock_base, unit_size FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })

  const unitSize = Number(rows[0].unit_size) > 0 ? Number(rows[0].unit_size) : 1
  const currentBase = Number(rows[0].stock_base ?? rows[0].stock * unitSize)
  const deltaBase = Number(qty) * unitSize
  const newBase = type === 'in' ? currentBase + deltaBase : Math.max(0, currentBase - deltaBase)
  const newStock = newBase / unitSize
  await db.query('UPDATE inventory SET stock=?, stock_base=? WHERE id=?', [newStock, newBase, req.params.id])
  await db.query(
    'INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note) VALUES (?,?,?,?,?)',
    [req.params.id, req.user.id, type, qty, note || null]
  )
  res.json({ stock: newStock })
}

// ── Supply Requests ───────────────────────────────────────────────────────────

const getSupplyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.category, i.unit, d.full_name AS doctor_name
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     JOIN doctors   d ON sr.doctor_id   = d.id
     ORDER BY sr.requested_at DESC`
  )
  res.json(rows)
}

const resolveSupplyRequest = async (req, res) => {
  const { status } = req.body
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ message: 'Status must be approved or rejected.' })

  const [rows] = await db.query('SELECT * FROM supply_requests WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Request not found.' })

  await db.query('UPDATE supply_requests SET status=? WHERE id=?', [status, req.params.id])

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
      'INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note) VALUES (?,?,?,?,?)',
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
  getAppointments, confirmAppointment, cancelAppointment, markAppointmentNoShow, rescheduleAppointment, createAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  createWalkInPatient,
  getStaff, createStaff, toggleStaff, updateStaff,
  getDoctors, createDoctor, toggleDoctor, updateDoctor,
  getDoctorSchedules, saveDaySchedule,
  getReports, getInventoryLogs,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock,
  getSupplyRequests, resolveSupplyRequest,
}
