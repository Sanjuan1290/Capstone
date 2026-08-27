// server/controllers/admin.controller.js
// FIXES:
// 1. getDashboard → now returns doctorStatus (Doctors Today was always empty)
// 2. getDashboard → removed fake "revenue" field; dashboard stat is now real
// 3. getDoctors / createDoctor → support prc_license column (run migration first)
// 4. getReports → now returns inventoryStats so Reports page shows real numbers
// 5. NEW: updateInventoryItem (PUT /inventory/:id) — edit a product
// 6. NEW: deleteInventoryItem (DELETE /inventory/:id) — remove a product
const { resolveReportRange } = require('../utils/reportRange')
const { normalizeOptionalImageUrl } = require('../utils/settingsValidation')

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { sendTempPassword, sendAppointmentStatusEmail } = require('../utils/emailService')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const {
  addInventoryBatch,
  attachBatchesToInventory,
  consumeInventoryFEFO,
  consumeInventoryByBatches,
  syncInventorySnapshot,
} = require('../utils/inventoryBatches')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly, getCurrentTimeLabel } = require('../utils/date')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientAppointmentStatusSms } = require('../utils/smsService')
const {
  getDoctorUnavailableDate,
  getDoctorUnavailableDates,
  countActiveAppointmentsOnDate,
} = require('../utils/doctorAvailability')
const { loadImagesForConsultationIds } = require('../utils/consultationImages')
const {
  getBillingCatalogServiceById,
  listBillingCatalog,
  normalizeServiceMaterials,
  getBillingRecordWithItems,
} = require('../utils/billing')
const { getWalkInPrecheck, addWalkInVisit } = require('../utils/walkIn')
const { writeAuditLog } = require('../utils/audit')
const { resolveSupplyTransfer } = require('../utils/supplyTransfers')
const { normalizeStockMovementType } = require('../utils/workflowValidation')
const {
  getActiveAppointmentConflict,
  getLastNoShowAppointment,
  makeNoShowWarningResponse,
} = require('../utils/appointmentPolicies')
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const DOCTOR_SPECIALTIES = new Set(['Dermatologist', 'General Medicine'])
const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

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
  batch_code: String(body.batch_code || '').trim() || null,
  storage_location: body.storage_location?.trim() || null,
})

const normalizeBillingCatalogPayload = (body = {}) => ({
  category: String(body.category || '').trim(),
  service_name: String(body.service_name || '').trim(),
  clinic_type: ['all', 'medical', 'derma'].includes(body.clinic_type) ? body.clinic_type : 'all',
  default_price: Math.max(0, Number(body.default_price ?? body.patient_price) || 0),
  consultation_fee: Math.max(0, Number(body.consultation_fee) || 0),
  profit_percentage: Math.max(0, Number(body.profit_percentage) || 20),
  is_active: body.is_active === 0 ? 0 : 1,
  sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  pricing_notes: String(body.pricing_notes || '').trim() || null,
  materials: normalizeServiceMaterials(body.materials),
})

const saveBillingServiceMaterials = async (serviceId, materials, executor = db) => {
  await executor.query('DELETE FROM billing_service_materials WHERE billing_service_id = ?', [serviceId])

  for (const material of materials) {
    await executor.query(
      `INSERT INTO billing_service_materials
       (billing_service_id, inventory_id, material_name, quantity, unit_label, unit_cost_override, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serviceId,
        material.inventory_id || null,
        material.material_name,
        material.quantity,
        material.unit_label,
        material.unit_cost_override,
        material.notes,
        material.sort_order,
      ]
    )
  }
}

const loadInventoryRows = async (executor = db, whereClause = '', params = []) => {
  const [rows] = await executor.query(
    `SELECT * FROM inventory
     ${whereClause}
     ORDER BY
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       name ASC`,
    params
  )
  return attachBatchesToInventory(rows, executor)
}

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

const buildPhoneSearchTerms = (value = '') => {
  const trimmed = String(value || '').trim()
  const digits = trimmed.replace(/\D/g, '')
  const normalizedPhone = normalizePhilippinePhone(trimmed)
  const localPhone = normalizedPhone
    ? `0${normalizedPhone.slice(2)}`
    : digits.startsWith('63') && digits.length >= 12
      ? `0${digits.slice(2)}`
      : digits.startsWith('9') && digits.length >= 10
        ? `0${digits}`
        : null

  return {
    likeSearch: `%${trimmed}%`,
    phoneSearch: `%${normalizedPhone || digits || trimmed}%`,
    altPhoneSearch: `%${localPhone || digits || trimmed}%`,
  }
}

const findExistingPatientByPhone = async (phone) => {
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone) return { normalizedPhone: null, existing: null }

  const localPhone = `0${normalizedPhone.slice(2)}`
  const [rows] = await db.query(
    `SELECT id, full_name, phone
     FROM patients
     WHERE ${NORMALIZED_PHONE_SQL} IN (?, ?)
     LIMIT 1`,
    [normalizedPhone, localPhone]
  )

  return {
    normalizedPhone,
    existing: rows[0] || null,
  }
}

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
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  const lastNoShow = await getLastNoShowAppointment(rows[0].patient_id)
  if (lastNoShow && !req.body?.override_no_show_warning) {
    return res.status(409).json(makeNoShowWarningResponse(lastNoShow))
  }
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
  await sendPatientAppointmentStatusSms({
    patientPhone: rows[0].patient_phone,
    patientName: rows[0].patient_name,
    doctorName: rows[0].doctor_name,
    appointmentDate: rows[0].appointment_date,
    appointmentTime: rows[0].appointment_time,
    status: 'confirmed',
  }).catch((err) => {
    console.error('SMS patient appointment confirmation failed:', err.message)
  })
  if (lastNoShow) {
    await createNotification({
      target_role: 'patient',
      target_user_id: rows[0].patient_id,
      type: 'appointment_policy_warning',
      title: 'Appointment policy reminder',
      message: 'Please arrive on time or cancel ahead if you cannot attend. Repeated no-shows or fake bookings may be cancelled by the clinic.',
      reference_type: 'appointment',
      reference_id: id,
    })
  }
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(id), status: 'confirmed' })
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
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
  await sendPatientAppointmentStatusSms({
    patientPhone: rows[0].patient_phone,
    patientName: rows[0].patient_name,
    doctorName: rows[0].doctor_name,
    appointmentDate: rows[0].appointment_date,
    appointmentTime: rows[0].appointment_time,
    status: 'cancelled',
  }).catch((err) => {
    console.error('SMS patient appointment cancellation failed:', err.message)
  })
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'cancelled' })
  res.json({ message: 'Appointment cancelled.' })
}

const markAppointmentNoShow = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time,
            p.id AS patient_id, p.full_name AS patient_name, p.phone AS patient_phone,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
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
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
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

  const blockedDate = await getDoctorUnavailableDate(rows[0].doctor_id, normalizedDate)
  if (blockedDate) {
    return res.status(409).json({
      message: blockedDate.reason || 'The doctor is unavailable on the selected date.',
    })
  }

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
  await sendPatientAppointmentStatusSms({
    patientPhone: rows[0].patient_phone,
    patientName: rows[0].patient_name,
    doctorName: rows[0].doctor_name,
    appointmentDate: normalizedDate,
    appointmentTime: appointment_time,
    status: 'rescheduled',
  }).catch((err) => {
    console.error('SMS patient appointment reschedule failed:', err.message)
  })
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

  const lastNoShow = await getLastNoShowAppointment(patient_id)
  if (lastNoShow && !req.body?.override_no_show_warning) {
    return res.status(409).json(makeNoShowWarningResponse(lastNoShow))
  }

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

  const blockedDate = await getDoctorUnavailableDate(doctor_id, normalizedDate)
  if (blockedDate) {
    return res.status(409).json({
      message: blockedDate.reason || 'The doctor is unavailable on the selected date.',
    })
  }

  const [result] = await db.query(
    'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes, appointment_source) VALUES (?,?,?,?,?,?,?,?)',
    [patient_id, doctor_id, clinic_type, reason || null, normalizedDate, appointment_time, notes || null, 'admin_booking']
  )
  await writeAuditLog({
    userId: req.user.id, userRole: 'admin', action: 'appointment.created', entityType: 'appointment', entityId: result.insertId,
    newValues: { patient_id, doctor_id, clinic_type, appointment_date: normalizedDate, appointment_time, appointment_source: 'admin_booking' }, ipAddress: req.ip || null,
  })
  const [rows] = await db.query(
    `SELECT p.full_name AS patient_name, d.id AS doctor_id, d.full_name AS doctor_name, d.phone AS doctor_phone
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
  await createNotification({
    target_role: 'doctor',
    target_user_id: rows[0].doctor_id,
    type: 'appointment_booked',
    title: 'New appointment booked',
    message: `${rows[0].patient_name} booked an appointment on ${normalizedDate} at ${appointment_time}.`,
    reference_type: 'appointment',
    reference_id: result.insertId,
  })
  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`], 'appointment_updated', { appointmentId: result.insertId, status: 'pending' })
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

const getQueuePrecheck = async (req, res) => {
  res.json(await getWalkInPrecheck(req.params.patientId))
}

const addToQueue = async (req, res) => {
  const result = await addWalkInVisit({
    patientId: req.body.patient_id,
    patientName: req.body.patient_name,
    doctorId: req.body.doctor_id,
    clinicType: req.body.type,
    reason: req.body.reason,
    checkInAppointmentId: req.body.check_in_appointment_id,
    allowSeparateWalkIn: Boolean(req.body.allow_separate_walkin),
    actorRole: 'admin',
    actorId: req.user.id,
    ipAddress: req.ip || null,
  })
  return res.status(result.status).json(result.body)
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
  const { likeSearch, phoneSearch, altPhoneSearch } = buildPhoneSearchTerms(search)
  const [rows] = await db.query(
    `SELECT id, full_name AS name, full_name, email, phone, sex, birthdate, address, civil_status, created_at
     FROM patients
     WHERE full_name LIKE ? OR email LIKE ? OR ${NORMALIZED_PHONE_SQL} LIKE ? OR ${NORMALIZED_PHONE_SQL} LIKE ?
     ORDER BY full_name`,
    [likeSearch, likeSearch, phoneSearch, altPhoneSearch]
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
            c.id AS consultation_id, c.diagnosis, c.prescription, c.notes AS consultation_notes
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

  const imagesByConsultationId = await loadImagesForConsultationIds(history.map((row) => row.consultation_id))

  res.json({
    patient,
    history: history.map((row) => ({
      ...row,
      progress_images: imagesByConsultationId[row.consultation_id] || [],
    })),
    upcoming,
  })
}

const createWalkInPatient = async (req, res) => {
  const { full_name, phone, email, birthdate, sex, consent_given, consent_method = 'signed_intake_form' } = req.body
  const name = String(full_name || '').trim()
  if (!name || !String(phone || '').trim()) return res.status(400).json({ message: 'Full name and phone number are required.' })
  if (!consent_given) return res.status(400).json({ message: 'Patient data privacy consent is required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone) return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  const localPhone = `0${normalizedPhone.slice(2)}`
  const [existingPhone] = await db.query(`SELECT id FROM patients WHERE ${NORMALIZED_PHONE_SQL} IN (?, ?) LIMIT 1`, [normalizedPhone, localPhone])
  if (existingPhone.length) return res.status(409).json({ message: 'A patient with that phone number already exists. Search and select the existing patient instead.' })
  const normalizedEmail = String(email || '').trim() || null
  if (normalizedEmail) {
    const [existingEmail] = await db.query('SELECT id FROM patients WHERE email = ? LIMIT 1', [normalizedEmail])
    if (existingEmail.length) return res.status(409).json({ message: 'A patient with that email already exists.' })
  }
  const normalizedSex = ['Male','Female','Other'].includes(String(sex || '')) ? String(sex) : null
  const normalizedBirthdate = /^\d{4}-\d{2}-\d{2}$/.test(String(birthdate || '')) ? String(birthdate) : null
  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
  const hashedPassword = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    `INSERT INTO patients
     (full_name, birthdate, gender, sex, phone, email, password, is_walk_in, consent_given, consent_given_at, consent_method, receive_promotions, is_profile_complete)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), ?, 0, 0)`,
    [name, normalizedBirthdate, normalizedSex, normalizedSex, normalizedPhone, normalizedEmail, hashedPassword, String(consent_method || 'signed_intake_form')]
  )
  await db.query('INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)', [result.insertId, 'data_processing', req.ip || null])
  await writeAuditLog({ userId: req.user.id, userRole: 'admin', action: 'patient.walkin_registered', entityType: 'patient', entityId: result.insertId, newValues: { full_name: name, phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex, consent_method }, ipAddress: req.ip || null })
  res.status(201).json({ id: result.insertId, full_name: name, phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex })
}


// ── Staff ─────────────────────────────────────────────────────────────────────

const getStaff = async (req, res) => {
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff ORDER BY full_name')
  res.json(rows)
}

const createStaff = async (req, res) => {
  const { full_name, email, phone } = req.body
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  const [existing] = await db.query('SELECT id FROM staff WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })
  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'
  const hashed = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    'INSERT INTO staff (full_name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [full_name, email, normalizedPhone, hashed, 'staff', 'active']
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
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })

  const [rows] = await db.query('SELECT id, email FROM staff WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Staff account not found.' })

  const [existing] = await db.query('SELECT id FROM staff WHERE email = ? AND id <> ?', [email, req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another staff account.' })

  await db.query(
    'UPDATE staff SET full_name = ?, email = ?, phone = ? WHERE id = ?',
    [full_name.trim(), email.trim(), normalizedPhone, req.params.id]
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
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
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
    [full_name, email, normalizedPhone, specialty || null, prc_license || null, hashed]
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
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  if (!DOCTOR_SPECIALTIES.has(specialty))
    return res.status(400).json({ message: 'Specialty must be Dermatologist or General Medicine.' })

  const [rows] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Doctor account not found.' })

  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ? AND id <> ?', [email, req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another doctor account.' })

  await db.query(
    'UPDATE doctors SET full_name = ?, email = ?, phone = ?, specialty = ?, prc_license = ? WHERE id = ?',
    [full_name.trim(), email.trim(), normalizedPhone, specialty?.trim() || null, prc_license?.trim() || null, req.params.id]
  )
  const [updated] = await db.query(
    'SELECT id, full_name, email, phone, specialty, prc_license, is_active, created_at FROM doctors WHERE id = ?',
    [req.params.id]
  )
  res.json(updated[0])
}

// ── Doctor Schedules ──────────────────────────────────────────────────────────

const getAppointmentReasonOptions = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, label, clinic_type, is_active, sort_order, created_at, updated_at
     FROM appointment_reason_options
     ORDER BY label ASC`
  )
  res.json(rows)
}

const createAppointmentReasonOption = async (req, res) => {
  const label = String(req.body.label || '').trim()
  const clinicType = ['medical', 'derma', 'all'].includes(req.body.clinic_type) ? req.body.clinic_type : 'all'

  if (!label) {
    return res.status(400).json({ message: 'Reason label is required.' })
  }

  try {
    const [result] = await db.query(
      `INSERT INTO appointment_reason_options (label, clinic_type, is_active, sort_order)
       VALUES (?, ?, ?, 0)`,
      [label, clinicType, req.body.is_active === 0 ? 0 : 1]
    )

    const [rows] = await db.query(
      'SELECT id, label, clinic_type, is_active, sort_order, created_at, updated_at FROM appointment_reason_options WHERE id = ?',
      [result.insertId]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That reason already exists for this clinic type.' })
    }
    throw err
  }
}

const updateAppointmentReasonOption = async (req, res) => {
  const label = String(req.body.label || '').trim()
  const clinicType = ['medical', 'derma', 'all'].includes(req.body.clinic_type) ? req.body.clinic_type : 'all'

  if (!label) {
    return res.status(400).json({ message: 'Reason label is required.' })
  }

  try {
    await db.query(
      `UPDATE appointment_reason_options
       SET label = ?, clinic_type = ?, is_active = ?, sort_order = 0
       WHERE id = ?`,
      [label, clinicType, req.body.is_active === 0 ? 0 : 1, req.params.reasonId]
    )

    const [rows] = await db.query(
      'SELECT id, label, clinic_type, is_active, sort_order, created_at, updated_at FROM appointment_reason_options WHERE id = ?',
      [req.params.reasonId]
    )
    if (rows.length === 0) return res.status(404).json({ message: 'Reason option not found.' })
    res.json(rows[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That reason already exists for this clinic type.' })
    }
    throw err
  }
}

const deleteAppointmentReasonOption = async (req, res) => {
  await db.query('DELETE FROM appointment_reason_options WHERE id = ?', [req.params.reasonId])
  res.json({ message: 'Reason option removed.' })
}

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

const getDoctorUnavailableDatesAdmin = async (req, res) => {
  const rows = await getDoctorUnavailableDates(req.params.id, {
    startDate: String(req.query.start_date || '').trim() || undefined,
    endDate: String(req.query.end_date || '').trim() || undefined,
  })
  res.json(rows)
}

const saveDoctorUnavailableDateAdmin = async (req, res) => {
  const unavailableDate = toDateOnly(req.body.unavailable_date)
  const reason = String(req.body.reason || '').trim() || null
  const doctorId = req.params.id

  if (!isValidDateOnly(unavailableDate)) {
    return res.status(400).json({ message: 'A valid unavailable date is required.' })
  }
  if (unavailableDate < getTodayDateOnly()) {
    return res.status(400).json({ message: 'Cannot block a past date.' })
  }

  const activeCount = await countActiveAppointmentsOnDate(doctorId, unavailableDate)
  if (activeCount > 0) {
    return res.status(409).json({
      message: 'This date already has active appointments. Reschedule or cancel them first.',
    })
  }

  await db.query(
    `INSERT INTO doctor_unavailable_dates (doctor_id, unavailable_date, reason, created_by_role, created_by_user_id)
     VALUES (?, ?, ?, 'admin', ?)
     ON DUPLICATE KEY UPDATE
       reason = VALUES(reason),
       created_by_role = 'admin',
       created_by_user_id = VALUES(created_by_user_id)`,
    [doctorId, unavailableDate, reason, req.user.id]
  )

  res.json({ message: 'Unavailable date saved.' })
}

const deleteDoctorUnavailableDateAdmin = async (req, res) => {
  const unavailableDate = toDateOnly(req.params.date)
  if (!isValidDateOnly(unavailableDate)) {
    return res.status(400).json({ message: 'A valid unavailable date is required.' })
  }

  await db.query(
    'DELETE FROM doctor_unavailable_dates WHERE doctor_id = ? AND unavailable_date = ?',
    [req.params.id, unavailableDate]
  )

  res.json({ message: 'Unavailable date removed.' })
}

const getBillingCatalogAdmin = async (req, res) => {
  const rows = await listBillingCatalog({
    clinicType: String(req.query.clinic_type || '').trim() || undefined,
    includeInactive: String(req.query.include_inactive || '').trim() === '1',
  })
  res.json(rows)
}

const createBillingCatalogService = async (req, res) => {
  const payload = normalizeBillingCatalogPayload(req.body)
  if (!payload.category || !payload.service_name) {
    return res.status(400).json({ message: 'Category and service name are required.' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO billing_service_catalog
       (category, service_name, clinic_type, default_price, consultation_fee, profit_percentage, is_active, sort_order, pricing_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.category,
        payload.service_name,
        payload.clinic_type,
        payload.default_price,
        payload.consultation_fee,
        payload.profit_percentage,
        payload.is_active,
        payload.sort_order,
        payload.pricing_notes,
      ]
    )
    await saveBillingServiceMaterials(result.insertId, payload.materials, conn)
    await writeAuditLog({ userId: req.user.id, userRole: 'admin', action: 'catalog.service_created', entityType: 'billing_service', entityId: result.insertId, newValues: payload, ipAddress: req.ip || null }, conn)
    await conn.commit()

    const created = await getBillingCatalogServiceById(result.insertId)
    res.status(201).json(created)
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That billing service already exists for this clinic type.' })
    }
    throw err
  } finally {
    conn.release()
  }
}

const updateBillingCatalogService = async (req, res) => {
  const payload = normalizeBillingCatalogPayload(req.body)
  if (!payload.category || !payload.service_name) {
    return res.status(400).json({ message: 'Category and service name are required.' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [existingRows] = await conn.query(
      'SELECT id FROM billing_service_catalog WHERE id = ? LIMIT 1',
      [req.params.serviceId]
    )
    if (existingRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Billing service not found.' })
    }

    await conn.query(
      `UPDATE billing_service_catalog
       SET category = ?, service_name = ?, clinic_type = ?, default_price = ?, consultation_fee = ?, profit_percentage = ?, is_active = ?, sort_order = ?, pricing_notes = ?
       WHERE id = ?`,
      [
        payload.category,
        payload.service_name,
        payload.clinic_type,
        payload.default_price,
        payload.consultation_fee,
        payload.profit_percentage,
        payload.is_active,
        payload.sort_order,
        payload.pricing_notes,
        req.params.serviceId,
      ]
    )
    await saveBillingServiceMaterials(req.params.serviceId, payload.materials, conn)
    await writeAuditLog({ userId: req.user.id, userRole: 'admin', action: 'catalog.service_updated', entityType: 'billing_service', entityId: req.params.serviceId, newValues: payload, ipAddress: req.ip || null }, conn)
    await conn.commit()

    const updated = await getBillingCatalogServiceById(req.params.serviceId)
    res.json(updated)
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That billing service already exists for this clinic type.' })
    }
    throw err
  } finally {
    conn.release()
  }
}

const deleteBillingCatalogService = async (req, res) => {
  const [rows] = await db.query('SELECT id, service_name FROM billing_service_catalog WHERE id = ? LIMIT 1', [req.params.serviceId])
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Billing service not found.' })
  }

  // Keep historical bill links valid. Used services are archived rather than physically deleted.
  const [[usage]] = await db.query(
    'SELECT COUNT(*) AS count FROM billing_items WHERE catalog_service_id = ?',
    [req.params.serviceId]
  )
  if (Number(usage?.count || 0) > 0) {
    await db.query('UPDATE billing_service_catalog SET is_active = 0 WHERE id = ?', [req.params.serviceId])
    return res.json({ message: 'Billing service archived because it is already used by a bill.', archived: true })
  }

  await db.query('DELETE FROM billing_service_catalog WHERE id = ?', [req.params.serviceId])
  res.json({ message: 'Billing service removed.', archived: false })
}


const getPaymentSettingsAdmin = async (req, res) => {
  const [rows] = await db.query(
    `SELECT gcash_qr_url, maya_qr_url, bank_name, bank_account_name, bank_account_number, updated_at
     FROM clinic_payment_settings WHERE id = 1 LIMIT 1`
  )
  res.json(rows[0] || {
    gcash_qr_url: '',
    maya_qr_url: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
    updated_at: null,
  })
}

const updatePaymentSettingsAdmin = async (req, res) => {
  const rawGcash = String(req.body.gcash_qr_url || '').trim()
  const rawMaya = String(req.body.maya_qr_url || '').trim()
  const gcashQrUrl = normalizeOptionalImageUrl(rawGcash)
  const mayaQrUrl = normalizeOptionalImageUrl(rawMaya)

  if (rawGcash && !gcashQrUrl) {
    return res.status(400).json({ message: 'GCash QR must use an HTTPS URL or an app-relative path.' })
  }
  if (rawMaya && !mayaQrUrl) {
    return res.status(400).json({ message: 'Maya QR must use an HTTPS URL or an app-relative path.' })
  }

  const payload = {
    gcash_qr_url: gcashQrUrl,
    maya_qr_url: mayaQrUrl,
    bank_name: String(req.body.bank_name || '').trim() || null,
    bank_account_name: String(req.body.bank_account_name || '').trim() || null,
    bank_account_number: String(req.body.bank_account_number || '').trim() || null,
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [oldRows] = await conn.query('SELECT * FROM clinic_payment_settings WHERE id = 1 LIMIT 1')
    await conn.query(
      `INSERT INTO clinic_payment_settings
       (id, gcash_qr_url, maya_qr_url, bank_name, bank_account_name, bank_account_number, updated_by_admin_id)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         gcash_qr_url = VALUES(gcash_qr_url),
         maya_qr_url = VALUES(maya_qr_url),
         bank_name = VALUES(bank_name),
         bank_account_name = VALUES(bank_account_name),
         bank_account_number = VALUES(bank_account_number),
         updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [payload.gcash_qr_url, payload.maya_qr_url, payload.bank_name, payload.bank_account_name, payload.bank_account_number, req.user.id]
    )
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'billing.payment_settings_updated',
      entityType: 'clinic_payment_settings',
      entityId: '1',
      oldValues: oldRows[0] || null,
      newValues: payload,
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  return getPaymentSettingsAdmin(req, res)
}

const getReports = async (req, res) => {
  let range
  try { range = resolveReportRange(req.query) }
  catch (error) { return res.status(error.statusCode || 400).json({ message: error.message }) }
  const { startDate, endDate } = range
  const dateParams = [startDate, endDate]

  const [monthly] = await db.query(
    `SELECT DATE_FORMAT(appointment_date, '%b %Y') AS month,
            DATE_FORMAT(appointment_date, '%Y-%m') AS ym,
            COUNT(*) AS appointments,
            COUNT(DISTINCT patient_id) AS patients,
            SUM(clinic_type = 'derma') AS derma,
            SUM(clinic_type = 'medical') AS medical
     FROM appointments WHERE appointment_date BETWEEN ? AND ?
     GROUP BY ym, month ORDER BY ym ASC`, dateParams)

  const [[appointmentSummary]] = await db.query(
    `SELECT COUNT(*) AS appointments, COUNT(DISTINCT patient_id) AS unique_patients,
            SUM(clinic_type = 'derma') AS derma, SUM(clinic_type = 'medical') AS medical,
            SUM(status = 'completed') AS completed, SUM(status = 'cancelled') AS cancelled,
            SUM(status = 'no_show') AS no_show
     FROM appointments WHERE appointment_date BETWEEN ? AND ?`, dateParams)

  const [statusRows] = await db.query(
    `SELECT status, COUNT(*) AS value FROM appointments
     WHERE appointment_date BETWEEN ? AND ? GROUP BY status`, dateParams)
  const appointmentTotal = statusRows.reduce((sum, row) => sum + Number(row.value || 0), 0)
  const colorMap = {
    completed: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    pending: { color: 'bg-amber-400', textColor: 'text-amber-600' },
    confirmed: { color: 'bg-sky-500', textColor: 'text-sky-600' },
    cancelled: { color: 'bg-red-400', textColor: 'text-red-500' },
    rescheduled: { color: 'bg-violet-400', textColor: 'text-violet-600' },
    no_show: { color: 'bg-slate-400', textColor: 'text-slate-500' },
    'in-progress': { color: 'bg-indigo-400', textColor: 'text-indigo-600' },
  }
  const statusBreakdown = statusRows.map((row) => ({
    label: String(row.status || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    value: Number(row.value || 0),
    pct: appointmentTotal > 0 ? Math.round((Number(row.value || 0) / appointmentTotal) * 100) : 0,
    color: (colorMap[row.status] || { color: 'bg-slate-400' }).color,
    textColor: (colorMap[row.status] || { textColor: 'text-slate-500' }).textColor,
  }))

  const [appointmentSources] = await db.query(
    `SELECT COALESCE(appointment_source, 'online') AS source, COUNT(*) AS value
     FROM appointments WHERE appointment_date BETWEEN ? AND ?
     GROUP BY COALESCE(appointment_source, 'online') ORDER BY value DESC`, dateParams)

  const [topDoctors] = await db.query(
    `SELECT d.full_name AS name, d.specialty, d.specialty LIKE '%erm%' AS is_derma,
            COUNT(*) AS appointments, COUNT(DISTINCT a.patient_id) AS patients,
            SUM(a.status = 'completed') AS completed
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.appointment_date BETWEEN ? AND ?
     GROUP BY d.id, d.full_name, d.specialty
     ORDER BY appointments DESC, patients DESC LIMIT 10`, dateParams)

  const [[newReturning]] = await db.query(
    `SELECT
       SUM(first_visit BETWEEN ? AND ?) AS new_patients,
       COUNT(*) - SUM(first_visit BETWEEN ? AND ?) AS returning_patients
     FROM (
       SELECT patient_id, MIN(appointment_date) AS first_visit
       FROM appointments
       WHERE patient_id IN (SELECT DISTINCT patient_id FROM appointments WHERE appointment_date BETWEEN ? AND ?)
       GROUP BY patient_id
     ) x`, [startDate, endDate, startDate, endDate, startDate, endDate])

  const [[inventoryStats]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM inventory) AS total_items,
       (SELECT COALESCE(SUM(stock * COALESCE(price, 0)), 0) FROM inventory) AS total_value,
       (SELECT SUM(stock = 0) FROM inventory) AS out_of_stock,
       (SELECT SUM(stock > 0 AND stock <= threshold) FROM inventory) AS low_stock,
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date IS NOT NULL AND expiration_date < CURDATE()) AS expired,
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_soon`)

  const [stockActivity] = await db.query(
    `SELECT DATE_FORMAT(logged_at, '%b %Y') AS month,
            DATE_FORMAT(logged_at, '%Y-%m') AS ym,
            SUM(type = 'in') AS stock_in_actions, SUM(type = 'out') AS stock_out_actions,
            COALESCE(SUM(CASE WHEN type = 'in' THEN qty ELSE 0 END), 0) AS stock_in,
            COALESCE(SUM(CASE WHEN type = 'out' THEN qty ELSE 0 END), 0) AS stock_out
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY ym, month ORDER BY ym ASC`, dateParams)

  const [stockMovementByReason] = await db.query(
    `SELECT COALESCE(movement_type, CASE WHEN type='in' THEN 'received' ELSE 'adjustment' END) AS movement_type,
            COUNT(*) AS actions, COALESCE(SUM(qty),0) AS quantity
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY movement_type ORDER BY quantity DESC`, dateParams)

  const [inventoryByCategory] = await db.query(
    `SELECT category, COUNT(*) AS items, COALESCE(SUM(stock), 0) AS total_stock,
            COALESCE(SUM(stock * COALESCE(price, 0)), 0) AS total_value
     FROM inventory GROUP BY category ORDER BY total_value DESC, category ASC`)

  const [[currentOperations]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE() AND status IN ('pending','confirmed','rescheduled','in-progress')) AS today_remaining,
       (SELECT COUNT(*) FROM appointments WHERE appointment_date > CURDATE() AND status IN ('pending','confirmed','rescheduled')) AS future_confirmed,
       (SELECT COUNT(*) FROM appointments WHERE status = 'pending' AND appointment_date >= CURDATE()) AS awaiting_approval,
       (SELECT COUNT(*) FROM queue WHERE queue_date = CURDATE() AND status IN ('waiting','in-progress')) AS walkin_queue,
       (SELECT COUNT(*) FROM supply_requests WHERE status = 'pending') AS pending_supply_requests`)

  const [[supplyRequests]] = await db.query(
    `SELECT SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected
     FROM supply_requests WHERE DATE(requested_at) BETWEEN ? AND ?`, dateParams)

  const [[billingSummary]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('voided') THEN subtotal ELSE 0 END), 0) AS gross_billed,
       COALESCE(SUM(CASE WHEN status NOT IN ('voided') THEN discount_amount ELSE 0 END), 0) AS discounts,
       COALESCE(SUM(CASE WHEN status NOT IN ('voided') THEN total_amount ELSE 0 END), 0) AS net_billed,
       SUM(status = 'paid') AS paid_bills,
       SUM(status = 'partially_paid') AS partially_paid_bills,
       SUM(status IN ('draft','pending','ready')) AS unpaid_bills,
       SUM(status = 'voided') AS voided_bills
     FROM billing_records
     WHERE DATE(COALESCE(finalized_at, created_at)) BETWEEN ? AND ?`, dateParams)

  const [[collectionSummary]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS collected,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(refund_amount,0) ELSE 0 END), 0) AS refunded
     FROM billing_payments WHERE DATE(paid_at) BETWEEN ? AND ?`, dateParams).catch((error) => {
       if (error.code === 'ER_NO_SUCH_TABLE') return [[{ collected: 0, refunded: 0 }]]
       throw error
     })

  const [[outstandingSummary]] = await db.query(
    `SELECT COALESCE(SUM(GREATEST(0, b.total_amount - COALESCE(p.paid_amount,0))),0) AS outstanding
     FROM billing_records b
     LEFT JOIN (
       SELECT billing_id, SUM(CASE WHEN status='completed' THEN amount - COALESCE(refund_amount,0) ELSE 0 END) AS paid_amount
       FROM billing_payments GROUP BY billing_id
     ) p ON p.billing_id = b.id
     WHERE b.status IN ('draft','pending','ready','partially_paid')`)

  const [paymentsByMethod] = await db.query(
    `SELECT payment_method, COUNT(*) AS transactions,
            COALESCE(SUM(amount - COALESCE(refund_amount,0)), 0) AS amount
     FROM billing_payments
     WHERE status = 'completed' AND DATE(paid_at) BETWEEN ? AND ?
     GROUP BY payment_method ORDER BY amount DESC`, dateParams).catch((error) => {
       if (error.code === 'ER_NO_SUCH_TABLE') return [[]]
       throw error
     })

  const [serviceRevenue] = await db.query(
    `SELECT bi.service_name, COUNT(DISTINCT bi.billing_id) AS bills,
            COALESCE(SUM(bi.quantity), 0) AS quantity,
            COALESCE(SUM(bi.line_total), 0) AS gross_billed_amount
     FROM billing_items bi
     JOIN billing_records br ON br.id = bi.billing_id AND br.status <> 'voided'
     WHERE DATE(COALESCE(br.finalized_at, br.created_at)) BETWEEN ? AND ?
     GROUP BY bi.service_name ORDER BY gross_billed_amount DESC LIMIT 10`, dateParams)

  const [revenueTrend] = await db.query(
    `SELECT DATE_FORMAT(paid_at, '%b %Y') AS month, DATE_FORMAT(paid_at, '%Y-%m') AS ym,
            COUNT(*) AS transactions,
            COALESCE(SUM(amount - COALESCE(refund_amount,0)), 0) AS revenue
     FROM billing_payments
     WHERE status='completed' AND DATE(paid_at) BETWEEN ? AND ?
     GROUP BY ym, month ORDER BY ym ASC`, dateParams).catch((error) => {
       if (error.code === 'ER_NO_SUCH_TABLE') return [[]]
       throw error
     })

  const [clinicSettingsRows] = await db.query('SELECT clinic_name, address, phone, email, report_footer FROM clinic_settings WHERE id = 1 LIMIT 1').catch(() => [[]])
  const collected = Number(collectionSummary?.collected || 0)
  const refunded = Number(collectionSummary?.refunded || 0)

  res.json({
    range: { start_date: startDate, end_date: endDate },
    clinicSettings: clinicSettingsRows[0] || null,
    monthly,
    appointmentSummary: {
      appointments: Number(appointmentSummary?.appointments || 0), unique_patients: Number(appointmentSummary?.unique_patients || 0),
      medical: Number(appointmentSummary?.medical || 0), derma: Number(appointmentSummary?.derma || 0),
      completed: Number(appointmentSummary?.completed || 0), cancelled: Number(appointmentSummary?.cancelled || 0), no_show: Number(appointmentSummary?.no_show || 0),
      new_patients: Number(newReturning?.new_patients || 0), returning_patients: Number(newReturning?.returning_patients || 0),
    },
    statusBreakdown, appointmentSources, topDoctors,
    inventoryStats: {
      ...inventoryStats,
      total_items: Number(inventoryStats?.total_items || 0), total_value: Number(inventoryStats?.total_value || 0),
      out_of_stock: Number(inventoryStats?.out_of_stock || 0), low_stock: Number(inventoryStats?.low_stock || 0),
      expired: Number(inventoryStats?.expired || 0), expiring_soon: Number(inventoryStats?.expiring_soon || 0),
    },
    stockActivity, stockMovementByReason, inventoryByCategory,
    currentOperations: {
      today_remaining: Number(currentOperations?.today_remaining || 0), future_confirmed: Number(currentOperations?.future_confirmed || 0),
      awaiting_approval: Number(currentOperations?.awaiting_approval || 0), walkin_queue: Number(currentOperations?.walkin_queue || 0),
      pending_supply_requests: Number(currentOperations?.pending_supply_requests || 0),
    },
    upcomingAppointments: Number(currentOperations?.future_confirmed || 0),
    supplyRequests: { pending: Number(supplyRequests?.pending || 0), approved: Number(supplyRequests?.approved || 0), rejected: Number(supplyRequests?.rejected || 0) },
    billingSummary: {
      gross_billed: Number(billingSummary?.gross_billed || 0), gross_billing: Number(billingSummary?.gross_billed || 0),
      discounts: Number(billingSummary?.discounts || 0), net_billed: Number(billingSummary?.net_billed || 0),
      collected, net_collected: Math.max(0, collected - refunded), refunded,
      outstanding: Number(outstandingSummary?.outstanding || 0), pending_receivables: Number(outstandingSummary?.outstanding || 0),
      paid_bills: Number(billingSummary?.paid_bills || 0), partially_paid_bills: Number(billingSummary?.partially_paid_bills || 0),
      unpaid_bills: Number(billingSummary?.unpaid_bills || 0), pending_bills: Number(billingSummary?.unpaid_bills || 0), voided_bills: Number(billingSummary?.voided_bills || 0),
    },
    paymentsByMethod, serviceRevenue, revenueTrend,
  })
}

const getInventoryLogs = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
  const offset = (page - 1) * limit
  const startDate = String(req.query.start_date || '').trim()
  const endDate = String(req.query.end_date || '').trim()

  const filters = []
  const params = []

  if (startDate) {
    filters.push('DATE(il.logged_at) >= ?')
    params.push(startDate)
  }

  if (endDate) {
    filters.push('DATE(il.logged_at) <= ?')
    params.push(endDate)
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM inventory_logs il
     ${whereClause}`,
    params
  )

  const [rows] = await db.query(
    `SELECT il.*, i.name AS item_name, ib.batch_code,
            COALESCE(s.full_name, a.full_name, 'System') AS performed_by,
            CASE
              WHEN il.admin_id IS NOT NULL THEN 'Admin'
              WHEN il.staff_id IS NOT NULL THEN 'Staff'
              ELSE 'System'
            END AS performed_by_role
     FROM inventory_logs il
     LEFT JOIN inventory i ON il.inventory_id = i.id
     LEFT JOIN inventory_batches ib ON ib.id = il.batch_id
     LEFT JOIN staff s ON il.staff_id = s.id
     LEFT JOIN admins a ON il.admin_id = a.id
     ${whereClause}
     ORDER BY il.logged_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  const totalPages = total > 0 ? Math.ceil(total / limit) : 1

  res.json({
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
    filters: {
      start_date: startDate || '',
      end_date: endDate || '',
    },
  })
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getInventory = async (req, res) => {
  const rows = await loadInventoryRows()
  res.json(rows)
}

const addInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier,
    expiration_date, batch_code, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO inventory
       (barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, unit, base_unit, unit_size, 0, threshold, price, supplier, null, storage_location]
    )
    let openingBatchId = null
    if (stock > 0) {
      openingBatchId = await addInventoryBatch(result.insertId, {
        quantity: stock,
        expiration_date,
        batch_code,
        note: 'Opening stock',
      }, conn)
    }
    await syncInventorySnapshot(result.insertId, conn)
    if (stock > 0 && openingBatchId) {
      await conn.query(
        `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, batch_id, to_location)
         VALUES (?, ?, 'in', ?, ?, 'received', ?, 'Main Stockroom')`,
        [
          result.insertId,
          req.user.id,
          stock,
          `Opening stock · ${batch_code || `Batch #${openingBatchId}`}${expiration_date ? ` · expires ${expiration_date}` : ''}`,
          openingBatchId,
        ]
      )
    }
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'inventory.item_created',
      entityType: 'inventory_item',
      entityId: result.insertId,
      newValues: { name, category, barcode, stock_unit: unit, dispensing_unit: base_unit, units_per_package: unit_size, opening_stock: Number(stock || 0), opening_batch_id: openingBatchId, opening_batch_code: batch_code || null, expiration_date: expiration_date || null },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    const rows = await loadInventoryRows(db, 'WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  } finally {
    conn.release()
  }
}

// FIX 5: Edit an existing inventory item
const updateInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, threshold, price, supplier,
    storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [currentRows] = await conn.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
    if (currentRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Item not found.' })
    }

    await conn.query(
      `UPDATE inventory
       SET barcode=?, name=?, category=?, unit=?, base_unit=?, unit_size=?, threshold=?, price=?, supplier=?, storage_location=?
       WHERE id=?`,
      [barcode, name, category, unit, base_unit, unit_size, threshold, price, supplier, storage_location, req.params.id]
    )
    await syncInventorySnapshot(req.params.id, conn)
    await conn.commit()
    const updated = await loadInventoryRows(db, 'WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That barcode is already assigned to another inventory item.' })
    }
    throw err
  } finally {
    conn.release()
  }
}

// FIX 5: Delete an inventory item
const deleteInventoryItem = async (req, res) => {
  const [rows] = await db.query('SELECT id, name, stock FROM inventory WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Item not found.' })
  if (Number(rows[0].stock || 0) > 0) {
    return res.status(409).json({
      message: 'This item still has batch stock. Record the appropriate batch stock-out/transfer first before deleting the item.',
    })
  }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'inventory.item_deleted',
      entityType: 'inventory_item',
      entityId: req.params.id,
      oldValues: { name: rows[0].name, stock: Number(rows[0].stock || 0) },
      ipAddress: req.ip || null,
    }, conn)
    await conn.query('DELETE FROM inventory WHERE id = ?', [req.params.id])
    await conn.commit()
    res.json({ message: 'Inventory item deleted.' })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

const updateStock = async (req, res) => {
  const { type, qty, note, movement_reason, expiration_date, batch_code, selected_batches } = req.body
  if (!['in', 'out'].includes(type) || !qty)
    return res.status(400).json({ message: 'type and qty required.' })
  const movementType = normalizeStockMovementType(type, movement_reason)
  const exactBatchRequired = type === 'out' && ['expired', 'damaged', 'wastage', 'returned_to_supplier'].includes(movementType)
  if (exactBatchRequired && (!Array.isArray(selected_batches) || selected_batches.length === 0)) {
    return res.status(400).json({ message: 'Select the exact batch/lot for expired, damaged, wastage, or supplier-return stock-out.' })
  }
  if (type === 'out' && Array.isArray(selected_batches) && selected_batches.length > 0) {
    const selectedQty = selected_batches.reduce((sum, entry) => sum + Number(entry?.quantity || 0), 0)
    if (selectedQty !== Number(qty)) {
      return res.status(400).json({ message: 'Selected batch quantities must equal the stock-out quantity.' })
    }
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT id, name FROM inventory WHERE id = ?', [req.params.id])
    if (rows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Item not found.' })
    }

    let auditValues = null

    if (type === 'in') {
      const newBatchId = await addInventoryBatch(req.params.id, {
        quantity: qty,
        expiration_date,
        batch_code,
        note: note || 'Manual stock-in',
      }, conn)
      await syncInventorySnapshot(req.params.id, conn)
      await conn.query(
        `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, batch_id, to_location)
         VALUES (?, ?, 'in', ?, ?, ?, ?, 'Main Stockroom')`,
        [req.params.id, req.user.id, qty, `${note || 'Stock received'} · ${batch_code || `Batch #${newBatchId}`}${expiration_date ? ` · expires ${expiration_date}` : ''}`, movementType, newBatchId]
      )
      auditValues = { type: 'in', movement_type: movementType, quantity: Number(qty), batch_id: newBatchId, batch_code: batch_code || null, expiration_date: expiration_date || null, location: 'Main Stockroom', note: note || null }
    } else {
      const consumption = Array.isArray(selected_batches) && selected_batches.length > 0
        ? await consumeInventoryByBatches(req.params.id, selected_batches, conn)
        : await consumeInventoryFEFO(req.params.id, qty, conn)
      if (!consumption.ok) {
        await conn.rollback()
        return res.status(400).json({ message: consumption.message })
      }
      for (const batch of consumption.consumed) {
        const batchLabel = batch.batch_code || `Batch #${batch.batch_id || batch.id}`
        await conn.query(
          `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, batch_id, from_location)
           VALUES (?, ?, 'out', ?, ?, ?, ?, ?)`,
          [req.params.id, req.user.id, batch.quantity, `${note || 'Manual stock-out'} · ${batchLabel}${batch.expiration_date ? ` · expires ${batch.expiration_date}` : ''}`, movementType, batch.batch_id || batch.id, batch.location || 'Main Stockroom']
        )
      }
      auditValues = { type: 'out', movement_type: movementType, quantity: Number(qty), batches: consumption.consumed.map((batch) => ({ batch_id: batch.batch_id || batch.id, batch_code: batch.batch_code || null, quantity: Number(batch.quantity || 0), expiration_date: batch.expiration_date || null, location: batch.location || 'Main Stockroom' })), note: note || null }
    }
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'inventory.stock_moved',
      entityType: 'inventory_item',
      entityId: req.params.id,
      newValues: { item_name: rows[0].name, ...auditValues },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    const updated = await loadInventoryRows(db, 'WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
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
  const result = await resolveSupplyTransfer({
    requestId: req.params.id,
    status: req.body.status,
    actorRole: 'admin',
    actorId: req.user.id,
    ipAddress: req.ip || null,
  })
  res.status(result.statusCode).json(result.body)
}

// ── Billing oversight / refunds / reconciliation ─────────────────────────────
const getBillingReconciliation = async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : getTodayDateOnly()
  const [methods] = await db.query(
    `SELECT payment_method, COUNT(*) AS transactions,
            COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END),0) AS gross,
            COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(refund_amount,0) ELSE 0 END),0) AS refunded,
            COALESCE(SUM(CASE WHEN status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS net
     FROM billing_payments WHERE DATE(paid_at)=? GROUP BY payment_method ORDER BY net DESC`, [date])
  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS transactions,
            COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END),0) AS gross_collected,
            COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(refund_amount,0) ELSE 0 END),0) AS refunded,
            COALESCE(SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END),0) AS voided_transactions,
            COALESCE(SUM(CASE WHEN payment_method='cash' AND status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS expected_cash
     FROM billing_payments WHERE DATE(paid_at)=?`, [date])
  const [[discounts]] = await db.query(
    `SELECT COALESCE(SUM(discount_amount),0) AS discounts FROM billing_records
     WHERE DATE(COALESCE(finalized_at,created_at))=? AND status <> 'voided'`, [date])
  const [closings] = await db.query(
    `SELECT cc.*, s.full_name AS staff_name FROM cashier_closings cc JOIN staff s ON s.id=cc.staff_id
     WHERE cc.closing_date=? ORDER BY cc.closed_at DESC`, [date])
  res.json({ date, methods, summary: { ...summary, discounts: Number(discounts?.discounts || 0) }, closings })
}

const voidBillingPayment = async (req, res) => {
  const paymentId = Number(req.params.paymentId)
  const reason = String(req.body.reason || '').trim()
  if (!reason) return res.status(400).json({ message: 'Void reason is required.' })
  const conn = await db.getConnection()
  let billingId
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM billing_payments WHERE id=? FOR UPDATE', [paymentId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Payment not found.' }) }
    const payment = rows[0]; billingId = payment.billing_id
    if (payment.status !== 'completed') { await conn.rollback(); return res.status(400).json({ message: 'Only completed payments can be voided.' }) }
    await conn.query(`UPDATE billing_payments SET status='voided', voided_at=NOW(), void_reason=? WHERE id=?`, [reason, paymentId])
    const bill = await getBillingRecordWithItems(billingId, conn)
    const paidAfter = Math.max(0, Number(bill.paid_amount || 0))
    const balanceAfter = Math.max(0, Number(bill.total_amount || 0) - paidAfter)
    const nextStatus = paidAfter <= 0 ? 'ready' : balanceAfter <= 0 ? 'paid' : 'partially_paid'
    await conn.query(`UPDATE billing_records SET status=?, paid_at=CASE WHEN ?='paid' THEN paid_at ELSE NULL END WHERE id=?`, [nextStatus, nextStatus, billingId])
    await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'billing.payment_voided',entityType:'billing_payment',entityId:paymentId,oldValues:{status:'completed',amount:payment.amount},newValues:{status:'voided',reason,billing_status:nextStatus},ipAddress:req.ip||null },conn)
    await conn.commit()
  } catch(e){ await conn.rollback(); throw e } finally { conn.release() }
  res.json(await getBillingRecordWithItems(billingId))
}

const refundBillingPayment = async (req, res) => {
  const paymentId = Number(req.params.paymentId)
  const reason = String(req.body.reason || '').trim()
  if (!reason) return res.status(400).json({ message: 'Refund reason is required.' })
  const conn = await db.getConnection(); let billingId
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM billing_payments WHERE id=? FOR UPDATE',[paymentId])
    if (!rows.length){ await conn.rollback(); return res.status(404).json({message:'Payment not found.'}) }
    const payment=rows[0]; billingId=payment.billing_id
    if(payment.status!=='completed'){ await conn.rollback(); return res.status(400).json({message:'Only completed payments can be refunded.'}) }
    const available=Math.max(0,Number(payment.amount||0)-Number(payment.refund_amount||0))
    const amount=req.body.amount===undefined||req.body.amount===null||req.body.amount===''?available:Math.max(0,Number(req.body.amount)||0)
    if(amount<=0||amount>available+0.001){ await conn.rollback(); return res.status(400).json({message:'Refund amount must be greater than zero and cannot exceed the refundable amount.'}) }
    const nextRefund=Math.round((Number(payment.refund_amount||0)+amount)*100)/100
    await conn.query(`UPDATE billing_payments SET refund_amount=?, refunded_at=NOW(), refund_reason=?, refunded_by_admin_id=? WHERE id=?`,[nextRefund,reason,req.user.id,paymentId])
    const bill=await getBillingRecordWithItems(billingId,conn)
    const paidAfter=Math.max(0,Number(bill.paid_amount||0))
    const balanceAfter=Math.max(0,Number(bill.total_amount||0)-paidAfter)
    const nextStatus=paidAfter<=0?'refunded':balanceAfter<=0?'paid':'partially_paid'
    await conn.query(`UPDATE billing_records SET status=?, refunded_at=CASE WHEN ?='refunded' THEN NOW() ELSE refunded_at END, refund_reason=CASE WHEN ?='refunded' THEN ? ELSE refund_reason END, paid_at=CASE WHEN ?='paid' THEN paid_at ELSE NULL END WHERE id=?`,[nextStatus,nextStatus,nextStatus,reason,nextStatus,billingId])
    await writeAuditLog({userId:req.user.id,userRole:'admin',action:'billing.payment_refunded',entityType:'billing_payment',entityId:paymentId,oldValues:{refund_amount:payment.refund_amount||0},newValues:{refund_amount:nextRefund,refund_delta:amount,reason,billing_status:nextStatus},ipAddress:req.ip||null},conn)
    await conn.commit()
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
  res.json(await getBillingRecordWithItems(billingId))
}

// ── Clinic settings ───────────────────────────────────────────────────────────
const getClinicSettingsAdmin = async (req,res) => {
  const [rows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1')
  res.json(rows[0]||{})
}
const updateClinicSettingsAdmin = async (req,res) => {
  const payload={
    clinic_name:String(req.body.clinic_name||'CARAIT MEDICAL AND DERMATOLOGY CLINIC').trim(),
    address:String(req.body.address||'').trim()||null, phone:String(req.body.phone||'').trim()||null,
    email:String(req.body.email||'').trim()||null, report_footer:String(req.body.report_footer||'').trim()||null,
    receipt_footer:String(req.body.receipt_footer||'').trim()||null,
  }
  if(!payload.clinic_name)return res.status(400).json({message:'Clinic name is required.'})
  const [oldRows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1')
  await db.query(`INSERT INTO clinic_settings (id,clinic_name,address,phone,email,report_footer,receipt_footer,updated_by_admin_id)
                  VALUES (1,?,?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE clinic_name=VALUES(clinic_name),address=VALUES(address),phone=VALUES(phone),email=VALUES(email),report_footer=VALUES(report_footer),receipt_footer=VALUES(receipt_footer),updated_by_admin_id=VALUES(updated_by_admin_id)`,
                 [payload.clinic_name,payload.address,payload.phone,payload.email,payload.report_footer,payload.receipt_footer,req.user.id])
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:'settings.clinic_updated',entityType:'clinic_settings',entityId:'1',oldValues:oldRows[0]||null,newValues:payload,ipAddress:req.ip||null})
  const [rows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1');res.json(rows[0])
}

// ── Discount presets ──────────────────────────────────────────────────────────
const getDiscountPresetsAdmin = async (req,res) => {
  const [rows]=await db.query('SELECT * FROM discount_presets ORDER BY sort_order,label');res.json(rows)
}
const saveDiscountPresetAdmin = async (req,res) => {
  const id=Number(req.params.id)||0
  const payload={label:String(req.body.label||'').trim(),discount_type:['percentage','fixed'].includes(req.body.discount_type)?req.body.discount_type:'fixed',value:Math.max(0,Number(req.body.value)||0),requires_reference:req.body.requires_reference?1:0,requires_admin_approval:req.body.requires_admin_approval?1:0,is_active:req.body.is_active===0?0:1,sort_order:Number(req.body.sort_order)||0}
  if(!payload.label)return res.status(400).json({message:'Discount label is required.'})
  let targetId=id
  if(id){ await db.query(`UPDATE discount_presets SET label=?,discount_type=?,value=?,requires_reference=?,requires_admin_approval=?,is_active=?,sort_order=? WHERE id=?`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active,payload.sort_order,id]) }
  else { const [r]=await db.query(`INSERT INTO discount_presets (label,discount_type,value,requires_reference,requires_admin_approval,is_active,sort_order) VALUES (?,?,?,?,?,?,?)`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active,payload.sort_order]); targetId=r.insertId }
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:id?'billing.discount_preset_updated':'billing.discount_preset_created',entityType:'discount_preset',entityId:targetId,newValues:payload,ipAddress:req.ip||null})
  const [rows]=await db.query('SELECT * FROM discount_presets WHERE id=?',[targetId]);res.status(id?200:201).json(rows[0])
}

// ── System audit log ──────────────────────────────────────────────────────────
const getAuditLogs = async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)), offset=(page-1)*limit
  const filters=[],params=[]
  if(req.query.start_date){filters.push('DATE(al.created_at)>=?');params.push(String(req.query.start_date))}
  if(req.query.end_date){filters.push('DATE(al.created_at)<=?');params.push(String(req.query.end_date))}
  if(req.query.user_role){filters.push('al.user_role=?');params.push(String(req.query.user_role))}
  if(req.query.entity_type){filters.push('al.entity_type=?');params.push(String(req.query.entity_type))}
  if(req.query.action){filters.push('al.action LIKE ?');params.push(`%${String(req.query.action)}%`)}
  if(req.query.search){filters.push('(al.action LIKE ? OR al.entity_type LIKE ? OR al.entity_id LIKE ?)');const q=`%${String(req.query.search)}%`;params.push(q,q,q)}
  const where=filters.length?`WHERE ${filters.join(' AND ')}`:''
  const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM audit_logs al ${where}`,params)
  const [rows]=await db.query(`SELECT al.*,
      CASE al.user_role WHEN 'admin' THEN a.full_name WHEN 'staff' THEN s.full_name WHEN 'doctor' THEN d.full_name WHEN 'patient' THEN p.full_name ELSE 'System' END AS performed_by
      FROM audit_logs al
      LEFT JOIN admins a ON al.user_role='admin' AND a.id=al.user_id
      LEFT JOIN staff s ON al.user_role='staff' AND s.id=al.user_id
      LEFT JOIN doctors d ON al.user_role='doctor' AND d.id=al.user_id
      LEFT JOIN patients p ON al.user_role='patient' AND p.id=al.user_id
      ${where} ORDER BY al.created_at DESC,al.id DESC LIMIT ? OFFSET ?`,[...params,limit,offset])
  const total=Number(count?.total||0),totalPages=Math.max(1,Math.ceil(total/limit))
  res.json({items:rows,pagination:{page,limit,total,totalPages,hasPrev:page>1,hasNext:page<totalPages}})
}

module.exports = {
  login, checkAuth, logout,
  getDashboard,
  getAppointments, confirmAppointment, cancelAppointment, markAppointmentNoShow, rescheduleAppointment, createAppointment,
  getQueue, getQueuePrecheck, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  createWalkInPatient,
  getStaff, createStaff, toggleStaff, updateStaff,
  getAppointmentReasonOptions, createAppointmentReasonOption, updateAppointmentReasonOption, deleteAppointmentReasonOption,
  getDoctors, createDoctor, toggleDoctor, updateDoctor,
  getDoctorSchedules, saveDaySchedule,
  getDoctorUnavailableDatesAdmin, saveDoctorUnavailableDateAdmin, deleteDoctorUnavailableDateAdmin,
  getBillingCatalogAdmin, createBillingCatalogService, updateBillingCatalogService, deleteBillingCatalogService,
  getPaymentSettingsAdmin, updatePaymentSettingsAdmin,
  getBillingReconciliation, voidBillingPayment, refundBillingPayment,
  getClinicSettingsAdmin, updateClinicSettingsAdmin, getDiscountPresetsAdmin, saveDiscountPresetAdmin, getAuditLogs,
  getReports, getInventoryLogs,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock,
  getSupplyRequests, resolveSupplyRequest,
}


