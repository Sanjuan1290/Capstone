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
const { markOverdueAppointments } = require('../utils/appointments')
const {
  addInventoryBatch,
  attachBatchesToInventory,
  consumeInventoryFEFO,
  consumeInventoryByBatches,
  consumeInventoryFromLocationFEFO,
  syncInventorySnapshot,
} = require('../utils/inventoryBatches')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly, getCurrentTimeLabel } = require('../utils/date')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientAppointmentStatusSms } = require('../utils/smsService')
const { getDoctorUnavailableDate, getDoctorUnavailableDates } = require('../utils/doctorAvailability')
const { loadImagesForConsultationIds } = require('../utils/consultationImages')
const {
  collectInventoryUsageFromBillingItems,
  computeBillingTotals,
  getBillingRecordWithItems,
  listBillingCatalog,
  normalizeBillingItems,
  saveBillingItems,
} = require('../utils/billing')
const {
  getActiveAppointmentConflict,
  getLastNoShowAppointment,
  makeNoShowWarningResponse,
} = require('../utils/appointmentPolicies')
const { isValidPaymentMethod, requiresPaymentReference, makeReceiptNumber, calculatePaymentAmounts } = require('../utils/payments')
const { isValidQueueStatus, isValidSupplyRequestResolution, normalizeStockMovementType } = require('../utils/workflowValidation')
const { resolveSupplyTransfer } = require('../utils/supplyTransfers')
const { getWalkInPrecheck, addWalkInVisit } = require('../utils/walkIn')
const { writeAuditLog } = require('../utils/audit')

const makeTempPassword = () => Math.random().toString(36).slice(-8)
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
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

const loadInventoryRows = async (executor = db, whereClause = '', params = []) => {
  const [rows] = await executor.query(
    `SELECT * FROM inventory
     ${whereClause}
     ORDER BY
       CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
       expiration_date ASC,
       category ASC,
       name ASC`,
    params
  )
  return attachBatchesToInventory(rows, executor)
}

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
  const today = getTodayDateOnly()
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
    [patient_id, doctor_id, clinic_type, reason || null, normalizedDate, appointment_time, notes || null, 'staff_booking']
  )
  await writeAuditLog({
    userId: req.user.id, userRole: 'staff', action: 'appointment.created', entityType: 'appointment', entityId: result.insertId,
    newValues: { patient_id, doctor_id, clinic_type, appointment_date: normalizedDate, appointment_time, appointment_source: 'staff_booking' }, ipAddress: req.ip || null,
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

const confirmAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = ?`,
    [req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  const lastNoShow = await getLastNoShowAppointment(rows[0].patient_id)
  if (lastNoShow && !req.body?.override_no_show_warning) {
    return res.status(409).json(makeNoShowWarningResponse(lastNoShow))
  }
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
      reference_id: req.params.id,
    })
  }
  broadcast(['admin', 'staff', `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'confirmed' })
  res.json({ message: 'Appointment confirmed.' })
}

const cancelAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
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
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
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
  const result = await getWalkInPrecheck(req.params.patientId)
  res.json(result)
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
    actorRole: 'staff',
    actorId: req.user.id,
    ipAddress: req.ip || null,
  })
  return res.status(result.status).json(result.body)
}

const updateQueueStatus = async (req, res) => {
  const { status } = req.body
  if (!isValidQueueStatus(status))
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

const createWalkInPatient = async (req, res) => {
  const {
    full_name = '', phone = '', email = '', birthdate = null, sex = null,
    consent_given, consent_method = 'signed_intake_form',
  } = req.body

  if (!String(full_name).trim() || !String(phone).trim())
    return res.status(400).json({ message: 'Full name and phone number are required.' })
  if (!consent_given)
    return res.status(400).json({ message: 'Patient data privacy consent is required before registration.' })

  const normalizedSex = ['Male', 'Female', 'Other'].includes(String(sex || '')) ? String(sex) : null
  const normalizedBirthdate = /^\d{4}-\d{2}-\d{2}$/.test(String(birthdate || '')) ? String(birthdate) : null
  const { normalizedPhone, existing } = await findExistingPatientByPhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  if (existing) {
    return res.status(409).json({
      message: 'A patient with that phone number already exists. Search for the patient and add them as an existing patient instead.',
    })
  }

  const normalizedEmail = String(email || '').trim() || null
  if (normalizedEmail) {
    const [existingEmail] = await db.query('SELECT id FROM patients WHERE email = ?', [normalizedEmail])
    if (existingEmail.length > 0) return res.status(409).json({ message: 'A patient with that email already exists.' })
  }

  const tempPassword = makeTempPassword()
  const hashedPassword = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    `INSERT INTO patients
      (full_name, birthdate, gender, sex, civil_status, phone, address, email, password, is_walk_in,
       consent_given, consent_given_at, consent_method, consent_recorded_by_staff_id, receive_promotions, is_profile_complete)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, 1, 1, NOW(), ?, ?, 0, 0)`,
    [String(full_name).trim(), normalizedBirthdate, normalizedSex, normalizedSex, normalizedPhone, normalizedEmail, hashedPassword, String(consent_method || 'signed_intake_form'), req.user.id]
  )

  await db.query(
    'INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)',
    [result.insertId, 'data_processing', req.ip || null]
  )
  await writeAuditLog({
    userId: req.user.id,
    userRole: 'staff',
    action: 'patient.walkin_registered',
    entityType: 'patient',
    entityId: result.insertId,
    newValues: { full_name: String(full_name).trim(), phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex, consent_method },
    ipAddress: req.ip || null,
  })

  res.status(201).json({ id: result.insertId, full_name: String(full_name).trim(), phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex })
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
            c.id AS consultation_id, c.diagnosis, c.prescription, c.notes AS consultation_notes
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC`,
    [req.params.id]
  )
  const imagesByConsultationId = await loadImagesForConsultationIds(history.map((row) => row.consultation_id))
  const [billingHistory] = await db.query(
    `SELECT b.id, b.status, b.subtotal, b.discount_amount, b.total_amount, b.payment_method, b.paid_at, b.created_at,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            a.reason, d.full_name AS doctor_name,
            COALESCE((SELECT SUM(CASE WHEN bp.status = 'completed' THEN bp.amount - COALESCE(bp.refund_amount, 0) ELSE 0 END)
                      FROM billing_payments bp WHERE bp.billing_id = b.id), 0) AS paid_amount
     FROM billing_records b
     JOIN appointments a ON a.id = b.appointment_id
     JOIN doctors d ON d.id = b.doctor_id
     WHERE b.patient_id = ?
     ORDER BY COALESCE(b.paid_at, b.created_at) DESC`,
    [req.params.id]
  )

  res.json({
    patient,
    history: history.map((row) => ({
      ...row,
      progress_images: imagesByConsultationId[row.consultation_id] || [],
    })),
    billing: billingHistory.map((bill) => ({ ...bill, balance_amount: Math.max(0, Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)) })),
  })
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getBills = async (req, res) => {
  const status = String(req.query.status || '').trim()
  const search = String(req.query.search || '').trim()
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
  const offset = (page - 1) * limit
  const conditions = []
  const params = []

  if (status) {
    conditions.push('b.status = ?')
    params.push(status)
  }
  if (search) {
    const like = `%${search}%`
    conditions.push(`(p.full_name LIKE ? OR d.full_name LIKE ? OR a.reason LIKE ? OR b.payment_method LIKE ? OR CAST(b.id AS CHAR) LIKE ?)`)
    params.push(like, like, like, like, like)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const baseJoin = `
    FROM billing_records b
    JOIN appointments a ON a.id = b.appointment_id
    JOIN patients p ON p.id = b.patient_id
    JOIN doctors d ON d.id = b.doctor_id
    LEFT JOIN staff s ON s.id = b.confirmed_by_staff_id
    LEFT JOIN (
      SELECT billing_id,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN amount - COALESCE(refund_amount, 0) ELSE 0 END), 0) AS paid_amount
      FROM billing_payments
      GROUP BY billing_id
    ) pay ON pay.billing_id = b.id
  `

  const [[countRow]] = await db.query(`SELECT COUNT(*) AS total ${baseJoin} ${whereClause}`, params)
  const [rows] = await db.query(
    `SELECT b.id, b.appointment_id, b.status, b.subtotal, b.discount_type, b.discount_label, b.discount_amount,
            b.total_amount, b.payment_method, b.payment_notes, b.paid_at, b.finalized_at, b.created_at, b.updated_at,
            COALESCE(pay.paid_amount, 0) AS paid_amount,
            GREATEST(0, b.total_amount - COALESCE(pay.paid_amount, 0)) AS balance_amount,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            a.appointment_time, a.reason AS appointment_reason, a.clinic_type, a.appointment_source,
            p.full_name AS patient_name, p.phone AS patient_phone,
            d.full_name AS doctor_name, d.specialty AS doctor_specialty,
            s.full_name AS confirmed_by_staff_name
     ${baseJoin}
     ${whereClause}
     ORDER BY FIELD(b.status, 'draft', 'pending', 'ready', 'partially_paid', 'paid', 'voided', 'refunded'), b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  const summaryConditions = []
  const summaryParams = []
  if (search) {
    const like = `%${search}%`
    summaryConditions.push(`(p.full_name LIKE ? OR d.full_name LIKE ? OR a.reason LIKE ? OR b.payment_method LIKE ? OR CAST(b.id AS CHAR) LIKE ?)`)
    summaryParams.push(like, like, like, like, like)
  }
  const summaryWhere = summaryConditions.length ? `WHERE ${summaryConditions.join(' AND ')}` : ''
  const [[summary]] = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(b.status IN ('draft','pending')) AS draft,
            SUM(b.status = 'ready') AS ready,
            SUM(b.status = 'partially_paid') AS partially_paid,
            SUM(b.status = 'paid') AS paid,
            COALESCE(SUM(CASE WHEN b.status IN ('draft','pending','ready','partially_paid') THEN GREATEST(0, b.total_amount - COALESCE(pay.paid_amount, 0)) ELSE 0 END), 0) AS outstanding,
            COALESCE(SUM(COALESCE(pay.paid_amount, 0)), 0) AS collected
     ${baseJoin}
     ${summaryWhere}`,
    summaryParams
  )

  const total = Number(countRow?.total || 0)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  res.json({
    items: rows.map((row) => ({ ...row, paid_amount: Number(row.paid_amount || 0), balance_amount: Number(row.balance_amount || 0) })),
    pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
    summary: {
      total: Number(summary?.total || 0),
      draft: Number(summary?.draft || 0),
      pending: Number(summary?.draft || 0),
      ready: Number(summary?.ready || 0),
      partially_paid: Number(summary?.partially_paid || 0),
      paid: Number(summary?.paid || 0),
      outstanding: Number(summary?.outstanding || 0),
      collected: Number(summary?.collected || 0),
    },
  })
}

const getBillingCatalogForStaff = async (req, res) => {
  const rows = await listBillingCatalog({
    clinicType: String(req.query.clinic_type || '').trim() || undefined,
  })
  res.json(rows)
}

const getBillById = async (req, res) => {
  const bill = await getBillingRecordWithItems(req.params.id)
  if (!bill) return res.status(404).json({ message: 'Billing record not found.' })
  res.json(bill)
}

const updateBill = async (req, res) => {
  const bill = await getBillingRecordWithItems(req.params.id)
  if (!bill) return res.status(404).json({ message: 'Billing record not found.' })
  if (!['draft', 'pending'].includes(bill.status)) {
    return res.status(400).json({ message: 'Only draft bills can be edited. Finalized or paid bills are locked.' })
  }
  if (Number(bill.paid_amount || 0) > 0) {
    return res.status(400).json({ message: 'A bill with recorded payments can no longer be edited.' })
  }

  const discountType = String(req.body.discount_type || 'none').trim() || 'none'
  const discountLabel = String(req.body.discount_label || '').trim() || null
  const discountAmount = Math.max(0, Number(req.body.discount_amount) || 0)
  const paymentNotes = String(req.body.payment_notes || '').trim() || null
  const items = await normalizeBillingItems(req.body.items, db)
  if (items.length === 0) return res.status(400).json({ message: 'Add at least one bill item.' })

  const totals = computeBillingTotals({ items, discount_amount: discountAmount })
  const writer = await db.getConnection()
  try {
    await writer.beginTransaction()
    await saveBillingItems(req.params.id, items, writer)
    await writer.query(
      `UPDATE billing_records
       SET status = 'draft', subtotal = ?, discount_type = ?, discount_label = ?, discount_amount = ?, total_amount = ?, payment_notes = ?
       WHERE id = ?`,
      [totals.subtotal, discountType, discountLabel, totals.discount_amount, totals.total_amount, paymentNotes, req.params.id]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'staff', action: 'billing.draft_updated', entityType: 'billing_record', entityId: req.params.id,
      oldValues: { subtotal: bill.subtotal, discount_amount: bill.discount_amount, total_amount: bill.total_amount },
      newValues: { subtotal: totals.subtotal, discount_type: discountType, discount_label: discountLabel, discount_amount: totals.discount_amount, total_amount: totals.total_amount },
      ipAddress: req.ip || null,
    }, writer)
    await writer.commit()
  } catch (err) {
    await writer.rollback(); throw err
  } finally { writer.release() }
  res.json(await getBillingRecordWithItems(req.params.id))
}

const finalizeBill = async (req, res) => {
  const bill = await getBillingRecordWithItems(req.params.id)
  if (!bill) return res.status(404).json({ message: 'Billing record not found.' })
  if (!['draft', 'pending'].includes(bill.status)) return res.status(400).json({ message: 'Only draft bills can be finalized.' })
  if (!Array.isArray(bill.items) || bill.items.length === 0) return res.status(400).json({ message: 'Add at least one bill item before finalizing.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    // Direct Medicine / Supply lines represent items that are physically dispensed
    // by the cashier/front desk. Service consumables are already deducted when the
    // doctor completes the consultation, so only direct supply lines are handled here.
    const directSupplies = bill.items.filter((item) => item.item_type === 'supply' && Number(item.source_inventory_id) > 0)
    for (const item of directSupplies) {
      const [inventoryRows] = await conn.query(
        'SELECT id, name, unit, base_unit, unit_size FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE',
        [item.source_inventory_id]
      )
      if (!inventoryRows.length) throw new Error(`Inventory item for ${item.service_name} is no longer available.`)
      const inventoryItem = inventoryRows[0]
      let details = {}
      try { details = typeof item.details_json === 'string' ? JSON.parse(item.details_json) : (item.details_json || {}) } catch { details = {} }
      const usageUnit = String(details?.unit || inventoryItem.unit || '').trim().toLowerCase()
      const baseUnit = String(inventoryItem.base_unit || '').trim().toLowerCase()
      const unitSize = Math.max(1, Number(inventoryItem.unit_size) || 1)
      const requestedQty = Math.max(0, Number(item.quantity) || 0)
      const packageQty = usageUnit && baseUnit && usageUnit === baseUnit
        ? requestedQty / unitSize
        : requestedQty
      const consumption = await consumeInventoryFromLocationFEFO(
        inventoryItem.id,
        packageQty,
        'Dispensing Area',
        conn,
        { fallbackLocation: 'Main Stockroom' }
      )
      if (!consumption.ok) {
        await conn.rollback()
        return res.status(400).json({ message: `Not enough stock for ${inventoryItem.name}. ${consumption.message}` })
      }

      let remainingUsageQty = requestedQty
      for (const batch of consumption.consumed) {
        const batchUsageQty = usageUnit && baseUnit && usageUnit === baseUnit
          ? Number(batch.quantity || 0) * unitSize
          : Number(batch.quantity || 0)
        const allocatedUsage = Math.min(remainingUsageQty, batchUsageQty)
        remainingUsageQty = Math.max(0, remainingUsageQty - allocatedUsage)
        const batchLabel = batch.batch_code || `Batch #${batch.batch_id}`

        await conn.query(
          `INSERT INTO billing_item_batch_usage
           (billing_id, billing_item_id, inventory_id, batch_id, package_quantity, usage_quantity, usage_unit_label, movement_type, source_location)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'dispensed', ?)`,
          [bill.id, item.id || null, inventoryItem.id, batch.batch_id, Number(batch.quantity || 0), allocatedUsage, details?.unit || inventoryItem.unit, batch.location || 'Dispensing Area']
        )
        await conn.query(
          `INSERT INTO inventory_logs
           (inventory_id, staff_id, type, qty, note, movement_type, reference_type, reference_id, batch_id, from_location)
           VALUES (?, ?, 'out', ?, ?, 'dispensed', 'billing_record', ?, ?, ?)`,
          [inventoryItem.id, req.user.id, Number(batch.quantity || 0), `${batchLabel} dispensed for billing record ${bill.id}: ${item.service_name}`, String(bill.id), batch.batch_id, batch.location || 'Dispensing Area']
        )
      }
    }

    await conn.query(
      `UPDATE billing_records SET status = 'ready', finalized_at = NOW(), finalized_by_staff_id = ? WHERE id = ?`,
      [req.user.id, req.params.id]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'staff', action: 'billing.finalized', entityType: 'billing_record', entityId: req.params.id,
      oldValues: { status: bill.status }, newValues: { status: 'ready', total_amount: bill.total_amount, dispensed_items: directSupplies.length }, ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
  broadcast(['admin', 'staff'], 'billing_finalized', { billingId: Number(req.params.id) })
  res.json(await getBillingRecordWithItems(req.params.id))
}

const payBill = async (req, res) => {
  const billingId = Number(req.params.id)
  const paymentMethod = String(req.body.payment_method || '').trim().toLowerCase()
  const paymentNotes = String(req.body.payment_notes || '').trim() || null
  const referenceNumber = String(req.body.reference_number || '').trim() || null
  if (!billingId) return res.status(400).json({ message: 'A valid billing record is required.' })
  if (!isValidPaymentMethod(paymentMethod)) return res.status(400).json({ message: 'Select a valid payment method.' })
  if (requiresPaymentReference(paymentMethod) && !referenceNumber) return res.status(400).json({ message: 'Enter the payment reference number.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [lockedRows] = await conn.query('SELECT * FROM billing_records WHERE id = ? LIMIT 1 FOR UPDATE', [billingId])
    if (!lockedRows.length) { await conn.rollback(); return res.status(404).json({ message: 'Billing record not found.' }) }
    const lockedBill = lockedRows[0]
    if (['paid', 'voided', 'refunded'].includes(lockedBill.status)) {
      await conn.rollback(); return res.status(409).json({ message: `This bill is already ${lockedBill.status}.` })
    }
    if (!['ready', 'partially_paid', 'pending'].includes(lockedBill.status)) {
      await conn.rollback(); return res.status(400).json({ message: 'Review and finalize this draft before accepting payment.' })
    }

    const existingBill = await getBillingRecordWithItems(billingId, conn)
    const balance = Math.max(0, Number(existingBill.balance_amount ?? existingBill.total_amount) || 0)
    if (balance <= 0) { await conn.rollback(); return res.status(409).json({ message: 'This bill has no remaining balance.' }) }
    const requestedPayment = req.body.payment_amount === '' || req.body.payment_amount === undefined || req.body.payment_amount === null
      ? balance
      : Math.max(0, Number(req.body.payment_amount) || 0)
    if (requestedPayment <= 0) { await conn.rollback(); return res.status(400).json({ message: 'Enter a payment amount greater than zero.' }) }
    if (requestedPayment > balance + 0.001) { await conn.rollback(); return res.status(400).json({ message: 'Payment amount cannot exceed the remaining balance.' }) }

    const tendered = paymentMethod === 'cash'
      ? Math.max(0, Number(req.body.amount_received ?? requestedPayment) || 0)
      : requestedPayment
    const paymentAmounts = calculatePaymentAmounts({ totalAmount: requestedPayment, amountReceived: tendered })
    if (!paymentAmounts.isSufficient) { await conn.rollback(); return res.status(400).json({ message: 'Amount received cannot be lower than the payment amount.' }) }

    const receiptNumber = makeReceiptNumber(billingId)
    const balanceAfter = Math.max(0, Math.round((balance - requestedPayment) * 100) / 100)
    const nextStatus = balanceAfter <= 0 ? 'paid' : 'partially_paid'

    await conn.query(
      `INSERT INTO billing_payments
       (billing_id, amount, payment_method, reference_number, amount_received, change_amount, receipt_number, status, notes, received_by_staff_id, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, NOW())`,
      [billingId, requestedPayment, paymentMethod, referenceNumber, tendered, paymentAmounts.changeAmount, receiptNumber, paymentNotes, req.user.id]
    )
    await conn.query(
      `UPDATE billing_records
       SET status = ?, payment_method = ?, payment_notes = ?, confirmed_by_staff_id = ?, paid_at = CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END
       WHERE id = ?`,
      [nextStatus, paymentMethod, paymentNotes, req.user.id, nextStatus, billingId]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'staff', action: 'billing.payment_received', entityType: 'billing_record', entityId: billingId,
      oldValues: { status: lockedBill.status, balance_amount: balance },
      newValues: { status: nextStatus, payment_amount: requestedPayment, balance_amount: balanceAfter, payment_method: paymentMethod, receipt_number: receiptNumber },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    broadcast(['admin', 'staff'], 'billing_paid', { billingId, receiptNumber, status: nextStatus })
  } catch (err) {
    await conn.rollback(); throw err
  } finally { conn.release() }
  res.json(await getBillingRecordWithItems(billingId))
}

// Backward-compatible route for older clients. It now uses the same atomic transaction.
const confirmBillPayment = payBill

const getDiscountPresets = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, label, discount_type, value, requires_reference, requires_admin_approval
     FROM discount_presets WHERE is_active = 1 ORDER BY sort_order ASC, label ASC`
  )
  res.json(rows)
}

const closeCashierShift = async (req, res) => {
  const closingDate = String(req.body.closing_date || getTodayDateOnly()).slice(0, 10)
  const [[summary]] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN payment_method = 'cash' AND status = 'completed' THEN amount - COALESCE(refund_amount,0) ELSE 0 END),0) AS expected_cash
     FROM billing_payments WHERE received_by_staff_id = ? AND DATE(paid_at) = ?`,
    [req.user.id, closingDate]
  )
  const expectedCash = Number(summary?.expected_cash || 0)
  const actualCash = Math.max(0, Number(req.body.actual_cash) || 0)
  const variance = Math.round((actualCash - expectedCash) * 100) / 100
  await db.query(
    `INSERT INTO cashier_closings (staff_id, closing_date, expected_cash, actual_cash, variance, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE expected_cash=VALUES(expected_cash), actual_cash=VALUES(actual_cash), variance=VALUES(variance), notes=VALUES(notes), closed_at=NOW()`,
    [req.user.id, closingDate, expectedCash, actualCash, variance, String(req.body.notes || '').trim() || null]
  )
  await writeAuditLog({ userId: req.user.id, userRole: 'staff', action: 'cashier.shift_closed', entityType: 'cashier_closing', entityId: closingDate, newValues: { expected_cash: expectedCash, actual_cash: actualCash, variance }, ipAddress: req.ip || null })
  res.json({ closing_date: closingDate, expected_cash: expectedCash, actual_cash: actualCash, variance })
}

const getPaymentSettingsForStaff = async (req, res) => {
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

const getInventory = async (req, res) => {
  const items = await loadInventoryRows()
  res.json(items)
}

const addInventoryItem = async (req, res) => {
  const {
    barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier,
    expiration_date, batch_code, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })

  if (barcode) {
    const [existing] = await db.query('SELECT id FROM inventory WHERE barcode = ?', [barcode])
    if (existing.length > 0)
      return res.status(409).json({ message: 'An item with that barcode already exists.' })
  }

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
        `INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note, movement_type, batch_id, to_location)
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
      userRole: 'staff',
      action: 'inventory.item_created',
      entityType: 'inventory_item',
      entityId: result.insertId,
      newValues: { name, category, barcode, stock_unit: unit, dispensing_unit: base_unit, units_per_package: unit_size, opening_stock: Number(stock || 0), opening_batch_id: openingBatchId, opening_batch_code: batch_code || null, expiration_date: expiration_date || null },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    const rows = await loadInventoryRows(db, 'WHERE id = ?', [result.insertId])
    return res.status(201).json(rows[0])
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

// FIX 2: Edit inventory item (name, barcode, category, unit, threshold, price, supplier)
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
    const [rows] = await conn.query('SELECT * FROM inventory WHERE id = ?', [req.params.id])
    if (rows.length === 0) {
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

// FIX 2: Delete inventory item
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
      userRole: 'staff',
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
    return res.status(400).json({ message: 'type and qty are required.' })
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
        `INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note, movement_type, batch_id, to_location)
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
          `INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note, movement_type, batch_id, from_location)
           VALUES (?, ?, 'out', ?, ?, ?, ?, ?)`,
          [req.params.id, req.user.id, batch.quantity, `${note || 'Manual stock-out'} · ${batchLabel}${batch.expiration_date ? ` · expires ${batch.expiration_date}` : ''}`, movementType, batch.batch_id || batch.id, batch.location || 'Main Stockroom']
        )
      }
      auditValues = { type: 'out', movement_type: movementType, quantity: Number(qty), batches: consumption.consumed.map((batch) => ({ batch_id: batch.batch_id || batch.id, batch_code: batch.batch_code || null, quantity: Number(batch.quantity || 0), expiration_date: batch.expiration_date || null, location: batch.location || 'Main Stockroom' })), note: note || null }
    }
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'staff',
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

const getDoctorUnavailableDatesForStaff = async (req, res) => {
  const rows = await getDoctorUnavailableDates(req.params.id, {
    startDate: String(req.query.start_date || '').trim() || undefined,
    endDate: String(req.query.end_date || '').trim() || undefined,
  })
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
  const result = await resolveSupplyTransfer({
    requestId: req.params.id,
    status: req.body.status,
    actorRole: 'staff',
    actorId: req.user.id,
    ipAddress: req.ip || null,
  })
  res.status(result.statusCode).json(result.body)
}

module.exports = {
  login, checkAuth, logout,
  getDashboard,
  getAppointments, createAppointment, confirmAppointment, cancelAppointment, markAppointmentNoShow, rescheduleAppointment,
  getQueue, getQueuePrecheck, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord, createWalkInPatient,
  getBills, getBillingCatalogForStaff, getBillById, updateBill, finalizeBill, payBill, confirmBillPayment, getDiscountPresets, closeCashierShift, getPaymentSettingsForStaff,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock,
  getDoctors, getDoctorSchedules, getDoctorUnavailableDatesForStaff,
  getSupplyRequests, resolveSupplyRequest,
}


