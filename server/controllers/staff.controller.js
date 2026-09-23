// server/controllers/staff.controller.js
// FIX 1: getDoctors now returns the 'type' field so Walk-in Queue doctor filter works
// FIX 2: Added updateInventoryItem and deleteInventoryItem
// FIX 3: getPatients returns 'name' alias so AddModal dropdown shows patient names

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { issueSession, verifySessionToken } = require('../utils/sessionSecurity')
const { makeTemporaryPassword } = require('../utils/securityCrypto')
const { sendAppointmentStatusEmail } = require('../utils/emailService')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const {
  receiveInventoryBatch,
  attachBatchesToInventory,
  consumeInventoryFromLocationFEFO,
  syncInventorySnapshot,
} = require('../utils/inventoryBatches')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly, getCurrentTimeLabel, getClinicDateTimeSql } = require('../utils/date')
const { normalizePhilippinePhone } = require('../utils/phone')
const { validateBirthdate } = require('../utils/patientProfile')
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
  replaceStaffBillingItems,
} = require('../utils/billing')
const {
  getActiveAppointmentConflict,
  getLastNoShowAppointment,
  makeNoShowWarningResponse,
} = require('../utils/appointmentPolicies')
const { isValidPaymentMethod, requiresPaymentReference, makeReceiptNumber, calculatePaymentAmounts } = require('../utils/payments')
const { isValidQueueStatus, isValidSupplyRequestResolution } = require('../utils/workflowValidation')
const { resolveSupplyTransfer } = require('../utils/supplyTransfers')
const { applyManualInventoryMovement } = require('../utils/manualInventoryMovement')
const { getWalkInPrecheck, addWalkInVisit } = require('../utils/walkIn')
const { buildDoctorAvailabilitySummary, buildWalkInDoctorAvailability } = require('../utils/doctorAvailabilitySummary')
const { setQueueState } = require('../utils/queueWorkflow')
const { writeAuditLog } = require('../utils/audit')
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition } = require('../utils/appointmentSecurity')
const { resolveDiscountForDraft, loadDiscountPreset } = require('../utils/billingSecurity')

const makeTempPassword = () => makeTemporaryPassword(14)
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

const normalizeInventoryPayload = (body = {}) => {
  const category = ['medical','derma'].includes(String(body.category || '').trim()) ? String(body.category).trim() : 'medical'
  const itemType = ['medicine','supplies'].includes(String(body.item_type || '').trim()) ? String(body.item_type).trim() : 'supplies'
  const uom = String(body.uom || body.base_unit || body.unit || '').trim().toLowerCase()
  return {
    barcode: body.barcode?.trim() || null,
    name: body.name?.trim() || '',
    category,
    item_type: itemType,
    uom,
    dosage_form: null,
    strength: null,
    unit: uom,
    base_unit: uom,
    unit_size: 1,
    stock: Math.max(0, Number(body.stock) || 0),
    threshold: Math.max(0, Number(body.threshold) || 0),
    price: Math.max(0, Number(body.price) || 0),
    supplier: body.supplier?.trim() || null,
    supplier_id: Number(body.supplier_id) || null,
    expiration_date: body.expiration_date || null,
    batch_code: String(body.batch_code || '').trim() || null,
    batch_lot_code: String(body.batch_lot_code || '').trim().replace(/^-+/, '') || null,
    location_type_id: Number(body.location_type_id) || null,
    storage_location_id: Number(body.storage_location_id) || null,
    storage_location: body.storage_location?.trim() || null,
  }
}

const resolveInventorySetupSelection = async ({ uom, location_type_id }, executor = db) => {
  if (!String(uom || '').trim()) {
    const error = new Error('Select a Unit of Measure configured in System Setup.')
    error.statusCode = 400
    error.code = 'INVENTORY_UOM_REQUIRED'
    throw error
  }
  const [[uomRow]] = await executor.query(
    'SELECT id,name,abbreviation FROM inventory_uoms WHERE LOWER(name)=? AND is_active=1 LIMIT 1',
    [String(uom).trim().toLowerCase()]
  )
  if (!uomRow) {
    const error = new Error('That Unit of Measure is unavailable. Configure an active Unit of Measure in System Setup.')
    error.statusCode = 400
    error.code = 'INVENTORY_UOM_INVALID'
    throw error
  }

  const locationTypeId = Number(location_type_id)
  if (!locationTypeId) {
    const error = new Error('Select a Location Type configured in System Setup.')
    error.statusCode = 400
    error.code = 'INVENTORY_LOCATION_TYPE_REQUIRED'
    throw error
  }
  const [[locationType]] = await executor.query(
    'SELECT id,name,code FROM inventory_location_types WHERE id=? AND is_active=1 LIMIT 1',
    [locationTypeId]
  )
  if (!locationType) {
    const error = new Error('That Location Type is unavailable. Configure an active Location Type in System Setup.')
    error.statusCode = 400
    error.code = 'INVENTORY_LOCATION_TYPE_INVALID'
    throw error
  }

  return {
    uom: String(uomRow.name || '').trim().toLowerCase(),
    locationType,
  }
}

const nextInventoryBarcode = async (category, conn = db) => {
  const normalized = category === 'derma' ? 'derma' : 'medical'
  const prefix = normalized === 'derma' ? 'DRM' : 'GMED'
  await conn.query('INSERT IGNORE INTO inventory_barcode_sequences (category,last_number) VALUES (?,0)', [normalized])
  await conn.query('UPDATE inventory_barcode_sequences SET last_number = LAST_INSERT_ID(last_number + 1) WHERE category = ?', [normalized])
  const [[row]] = await conn.query('SELECT last_number FROM inventory_barcode_sequences WHERE category = ?', [normalized])
  return `${prefix}-${String(Number(row?.last_number || 1)).padStart(5, '0')}`
}

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
    `SELECT i.*, lt.name AS location_type_name, lt.code AS location_type_code
     FROM (
       SELECT *
       FROM inventory
       ${whereClause}
     ) i
     LEFT JOIN inventory_location_types lt ON lt.id = i.location_type_id
     ORDER BY
       CASE WHEN i.expiration_date IS NULL THEN 1 ELSE 0 END,
       i.expiration_date ASC,
       i.category ASC,
       i.name ASC`,
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
  if (rows.length === 0) {
    await writeAuditLog({ userRole: 'staff', action: 'auth.login_failed', entityType: 'staff', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const staff = rows[0]
  const match = await bcrypt.compare(password, staff.password)
  if (!match) {
    await writeAuditLog({ userId: staff.id, userRole: 'staff', action: 'auth.login_failed', entityType: 'staff', entityId: staff.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  await issueSession(res, 'staff', staff.id)
  await writeAuditLog({ userId: staff.id, userRole: 'staff', action: 'auth.login_success', entityType: 'staff', entityId: staff.id, ipAddress: req.ip || null }).catch(() => {})

  res.status(200).json({
    message: 'Login successful.',
    user: { id: staff.id, full_name: staff.full_name, email: staff.email, role: 'staff', theme_preference: staff.theme_preference, profile_image_url: staff.profile_image_url, must_change_password: Boolean(staff.must_change_password) },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['staff_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = await verifySessionToken(token, 'staff')
    const [rows] = await db.query(
      "SELECT id, full_name, email, theme_preference, profile_image_url, must_change_password, password_changed_at FROM staff WHERE id = ? AND status = 'active'", [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'staff' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = async (req, res) => {
  await writeAuditLog({ userId: req.user?.id || null, userRole: 'staff', action: 'auth.logout', entityType: 'staff', entityId: req.user?.id || null, ipAddress: req.ip || null }).catch(() => {})
  res.clearCookie('staff_token', { path: '/' })
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
    "SELECT COUNT(*) AS queueCount FROM queue WHERE queue_date = ? AND status IN ('waiting','called','in_consultation')", [today]
  )
  const [[{ lowStock }]]      = await db.query(
    'SELECT COUNT(*) AS lowStock FROM inventory WHERE stock <= threshold'
  )
  const [[{ totalPatients }]] = await db.query('SELECT COUNT(*) AS totalPatients FROM patients')
  res.json({ totalToday, pendingCount, queueCount, lowStock, totalPatients })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  const { date } = req.query
  const requestedSort = String(req.query.sort || '')
  const sort = ['visit_time', 'created_at', 'updated_at'].includes(requestedSort) ? requestedSort : (date ? 'visit_time' : 'created_at')
  const requestedDirection = String(req.query.direction || '').toLowerCase()
  const direction = requestedDirection === 'asc' ? 'ASC' : requestedDirection === 'desc' ? 'DESC' : (sort === 'visit_time' ? 'ASC' : 'DESC')
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
  if (sort === 'created_at') sql += ` ORDER BY a.created_at ${direction}, a.id ${direction}`
  else if (sort === 'updated_at') sql += ` ORDER BY a.updated_at ${direction}, a.id ${direction}`
  else sql += ` ORDER BY a.appointment_date ${direction}, STR_TO_DATE(a.appointment_time, '%h:%i %p') ${direction}, a.id ${direction}`
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

  const result = await withAppointmentSlotLock({ doctorId: doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: doctor_id, clinicType: clinic_type, date: normalizedDate, time: appointment_time })
    const [inserted] = await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes, appointment_source) VALUES (?,?,?,?,?,?,?,?)',
      [patient_id, doctor_id, clinic_type, reason || null, normalizedDate, appointment_time, notes || null, 'staff_booking']
    )
    return inserted
  })
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
  broadcast(['admin', 'staff'], 'appointment_updated', { appointmentId: result.insertId, status: 'pending' })
  res.status(201).json({ message: 'Appointment created.', id: result.insertId })
}

const confirmAppointment = async (req, res) => {
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
            d.id AS doctor_id, d.full_name AS doctor_name
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
  assertAppointmentTransition(rows[0].status, 'confirmed')
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id])
  await writeAuditLog({userId:req.user.id,userRole:'staff',action:'appointment.confirmed',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'confirmed'},ipAddress:req.ip||null}).catch(() => {})
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_confirmed',
    title: 'Appointment confirmed',
    message: `Your appointment with ${rows[0].doctor_name} has been confirmed.`,
    reference_type: 'appointment',
    reference_id: req.params.id,
  })
  await createNotification({
    target_role: 'doctor',
    target_user_id: rows[0].doctor_id,
    type: 'appointment_confirmed',
    title: 'Confirmed appointment',
    message: `${rows[0].patient_name} has a confirmed appointment on ${rows[0].appointment_date} at ${rows[0].appointment_time}.`,
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
  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`, `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'confirmed' })
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
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  assertAppointmentTransition(rows[0].status, 'cancelled')
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  await writeAuditLog({userId:req.user.id,userRole:'staff',action:'appointment.cancelled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'cancelled'},ipAddress:req.ip||null}).catch(() => {})
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
  assertAppointmentTransition(rows[0].status, 'no_show')
  await db.query("UPDATE appointments SET status = 'no_show' WHERE id = ?", [req.params.id])
  await writeAuditLog({userId:req.user.id,userRole:'staff',action:'appointment.no_show',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'no_show'},ipAddress:req.ip||null}).catch(() => {})
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

  assertAppointmentTransition(rows[0].status, 'rescheduled')
  await withAppointmentSlotLock({ doctorId: rows[0].doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: rows[0].doctor_id, clinicType: rows[0].clinic_type, date: normalizedDate, time: appointment_time, excludeAppointmentId: req.params.id })
    await db.query(
      "UPDATE appointments SET appointment_date=?, appointment_time=?, status='confirmed' WHERE id=?",
      [normalizedDate, appointment_time, req.params.id]
    )
  })
  await writeAuditLog({userId:req.user.id,userRole:'staff',action:'appointment.rescheduled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'confirmed',appointment_date:normalizedDate,appointment_time},ipAddress:req.ip||null}).catch(() => {})
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

const getAppointmentReasons = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (clinicType && !['medical', 'derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Invalid clinic type.' })
  }
  const params = []
  let sql = `SELECT id, label, clinic_type, is_active, sort_order
             FROM appointment_reason_options
             WHERE is_active = 1`
  if (clinicType) {
    sql += ' AND (clinic_type = ? OR clinic_type = "all")'
    params.push(clinicType)
  }
  sql += ' ORDER BY label ASC'
  const [rows] = await db.query(sql, params)
  res.json(rows)
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
  const requestedStatus = String(req.body.status || '').trim()
  const target = requestedStatus === 'in-progress' ? 'called' : requestedStatus
  if (!isValidQueueStatus(requestedStatus) && !['called','in_consultation'].includes(target)) {
    return res.status(400).json({ message: 'Invalid queue status.' })
  }
  try {
    const row = await setQueueState({
      queueId: req.params.id,
      nextStatus: target,
      actorRole: 'staff',
      actorId: req.user.id,
      ipAddress: req.ip || null,
    })
    res.json({ message: target === 'called' ? 'Patient called.' : 'Queue updated.', queue: row })
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ code: error.code, message: error.message })
    throw error
  }
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
  const birthdateError = birthdate ? validateBirthdate(String(birthdate)) : null
  if (birthdateError) return res.status(400).json({ message: birthdateError })
  const normalizedBirthdate = birthdate ? String(birthdate).slice(0,10) : null
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
  const rawStatus = String(req.query.status || '').trim()
  const statuses = rawStatus.split(',').map((value) => value.trim()).filter(Boolean)
  const search = String(req.query.search || '').trim()
  const paymentMethod = String(req.query.payment_method || '').trim().toLowerCase()
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date_from || '')) ? String(req.query.date_from) : ''
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date_to || '')) ? String(req.query.date_to) : ''
  const dateBasis = ['visit','payment','finalized'].includes(String(req.query.date_basis || '').toLowerCase()) ? String(req.query.date_basis).toLowerCase() : 'visit'
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
  const offset = (page - 1) * limit

  const buildFilters = ({ includeStatus = true } = {}) => {
    const conditions = []
    const params = []
    if (includeStatus) {
      if (statuses.length === 1) { conditions.push('b.status = ?'); params.push(statuses[0]) }
      else if (statuses.length > 1) { conditions.push(`b.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses) }
    }
    if (dateBasis === 'payment' && (paymentMethod || dateFrom || dateTo)) {
      const paymentFilters = ["bpf.billing_id=b.id", "bpf.status='completed'"]
      if (paymentMethod) { paymentFilters.push('bpf.payment_method=?'); params.push(paymentMethod) }
      if (dateFrom) { paymentFilters.push('DATE(bpf.paid_at)>=?'); params.push(dateFrom) }
      if (dateTo) { paymentFilters.push('DATE(bpf.paid_at)<=?'); params.push(dateTo) }
      conditions.push(`EXISTS (SELECT 1 FROM billing_payments bpf WHERE ${paymentFilters.join(' AND ')})`)
    } else {
      if (paymentMethod) {
        conditions.push(`EXISTS (SELECT 1 FROM billing_payments bpm WHERE bpm.billing_id=b.id AND bpm.payment_method=? AND bpm.status='completed')`)
        params.push(paymentMethod)
      }
      const dateSql = dateBasis === 'finalized' ? (op) => `DATE(b.finalized_at) ${op} ?` : (op) => `a.appointment_date ${op} ?`
      if (dateFrom) { conditions.push(dateSql('>=')); params.push(dateFrom) }
      if (dateTo) { conditions.push(dateSql('<=')); params.push(dateTo) }
    }
    if (search) {
      const like = `%${search}%`
      conditions.push(`(p.full_name LIKE ? OR d.full_name LIKE ? OR a.reason LIKE ? OR CAST(b.id AS CHAR) LIKE ?
        OR EXISTS (SELECT 1 FROM billing_payments bps WHERE bps.billing_id=b.id AND (bps.payment_method LIKE ? OR COALESCE(bps.reference_number,'') LIKE ? OR COALESCE(bps.receipt_number,'') LIKE ?)))`)
      params.push(like, like, like, like, like, like, like)
    }
    return { conditions, params }
  }

  const { conditions, params } = buildFilters({ includeStatus: true })
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const baseJoin = `
    FROM billing_records b
    JOIN appointments a ON a.id = b.appointment_id
    JOIN patients p ON p.id = b.patient_id
    JOIN doctors d ON d.id = b.doctor_id
    LEFT JOIN staff s ON s.id = b.confirmed_by_staff_id
    LEFT JOIN (
      SELECT billing_id,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN amount - COALESCE(refund_amount, 0) ELSE 0 END), 0) AS paid_amount,
             GROUP_CONCAT(DISTINCT CASE WHEN status='completed' THEN payment_method END ORDER BY payment_method SEPARATOR ',') AS payment_methods,
             MAX(CASE WHEN status='completed' THEN paid_at END) AS latest_payment_at
      FROM billing_payments
      GROUP BY billing_id
    ) pay ON pay.billing_id = b.id
  `

  const [[countRow]] = await db.query(`SELECT COUNT(*) AS total ${baseJoin} ${whereClause}`, params)
  const [rows] = await db.query(
    `SELECT b.id, b.appointment_id, b.status, b.subtotal, b.discount_type, b.discount_label, b.discount_amount,
            b.total_amount, b.payment_method, b.payment_notes, b.paid_at, b.finalized_at, b.created_at, b.updated_at, b.version,
            COALESCE(pay.paid_amount, 0) AS paid_amount,
            GREATEST(0, b.total_amount - COALESCE(pay.paid_amount, 0)) AS balance_amount,
            COALESCE(pay.payment_methods,'') AS payment_methods,
            pay.latest_payment_at,
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

  const summaryFilter = buildFilters({ includeStatus: false })
  const summaryWhere = summaryFilter.conditions.length ? `WHERE ${summaryFilter.conditions.join(' AND ')}` : ''
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
    summaryFilter.params
  )

  const total = Number(countRow?.total || 0)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  res.json({
    items: rows.map((row) => ({
      ...row,
      paid_amount: Number(row.paid_amount || 0),
      balance_amount: Number(row.balance_amount || 0),
      payment_methods: String(row.payment_methods || '').split(',').filter(Boolean),
    })),
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

const validateStaffSupplyAvailability = async (items = [], executor = db) => {
  const grouped = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    if (String(item?.item_type || '') !== 'supply' || String(item?.source_type || '') !== 'staff_supply') continue
    const inventoryId = Number(item?.source_inventory_id || 0)
    if (!inventoryId) continue
    let details = item?.details || item?.details_json || null
    if (typeof details === 'string') { try { details = JSON.parse(details) } catch { details = null } }
    const current = grouped.get(inventoryId) || { inventory_id: inventoryId, requested: 0, unit: details?.unit || null }
    current.requested += Math.max(0, Number(item?.quantity || 0))
    if (!current.unit && details?.unit) current.unit = details.unit
    grouped.set(inventoryId, current)
  }

  const checks = []
  for (const entry of grouped.values()) {
    const [[inventoryItem]] = await executor.query(
      'SELECT id,name,unit,base_unit,unit_size FROM inventory WHERE id=? LIMIT 1',
      [entry.inventory_id]
    )
    if (!inventoryItem) {
      checks.push({ ...entry, name: 'Inventory item', available: 0, sufficient: false })
      continue
    }
    const [[stock]] = await executor.query(
      `SELECT COALESCE(SUM(ilb.quantity),0) AS package_available
       FROM inventory_location_batches ilb
       JOIN inventory_locations il ON il.id=ilb.location_id
       JOIN inventory_batches ib ON ib.id=ilb.batch_id
       WHERE ilb.inventory_id=? AND il.name IN ('Dispensing Area','Main Stockroom')
         AND ilb.quantity>0 AND ib.quantity>0
         AND (ib.expiration_date IS NULL OR ib.expiration_date >= CURDATE())`,
      [inventoryItem.id]
    )
    const packageAvailable = Number(stock?.package_available || 0)
    const unit = String(entry.unit || inventoryItem.unit || '').trim()
    const baseUnit = String(inventoryItem.base_unit || '').trim()
    const unitSize = Math.max(1, Number(inventoryItem.unit_size) || 1)
    const available = unit && baseUnit && unit.toLowerCase() === baseUnit.toLowerCase()
      ? packageAvailable * unitSize
      : packageAvailable
    checks.push({ ...entry, name: inventoryItem.name, unit: unit || inventoryItem.unit || '', available, sufficient: available + 0.0001 >= entry.requested })
  }
  return checks
}

const updateBill = async (req, res) => {
  const actorRole = req.user?.role === 'admin' ? 'admin' : 'staff'
  const isAdminActor = actorRole === 'admin'
  const billingId = Number(req.params.id)
  const expectedVersion = Number(req.body.expected_version)
  if (!billingId) return res.status(400).json({ message: 'A valid billing record is required.' })
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return res.status(400).json({ message: 'Reload this bill before saving. A valid bill version is required.', code: 'BILL_VERSION_REQUIRED' })
  }

  const paymentNotes = String(req.body.payment_notes || '').trim() || null
  const rawItems = Array.isArray(req.body.items) ? req.body.items : []
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [lockedRows] = await conn.query('SELECT * FROM billing_records WHERE id = ? LIMIT 1 FOR UPDATE', [billingId])
    if (!lockedRows.length) { await conn.rollback(); return res.status(404).json({ message: 'Billing record not found.' }) }
    const locked = lockedRows[0]
    if (!['draft', 'pending'].includes(locked.status)) { await conn.rollback(); return res.status(400).json({ message: 'Only draft bills can be edited. Finalized or paid bills are locked.' }) }
    if (Number(locked.version || 1) !== expectedVersion) {
      await conn.rollback()
      return res.status(409).json({ message: 'This bill was updated by another user while you were working on it. Review the latest version before saving.', code: 'BILL_VERSION_CONFLICT', current_version: Number(locked.version || 1) })
    }

    const currentBill = await getBillingRecordWithItems(billingId, conn)
    if (Number(currentBill.paid_amount || 0) > 0) { await conn.rollback(); return res.status(400).json({ message: 'A bill with recorded payments can no longer be edited.' }) }

    // Consultation-owned lines are server-owned clinical facts. Checkout never round-trips
    // or mutates them; Staff/Admin may only add non-service charges and billing-level fields.
    const consultationItems = (currentBill.items || []).filter((item) => item.source_type === 'consultation')
    const protectedIds = new Set(consultationItems.map((item) => Number(item.id)))
    const securedConsultationItems = consultationItems.map((existing) => ({
      ...existing,
      id: Number(existing.id),
      source_type: 'consultation',
      source_reference_id: existing.source_reference_id || currentBill.consultation_id || null,
      unit_price: Number(existing.unit_price || 0),
      line_total: Math.round(Number(existing.quantity || 0) * Number(existing.unit_price || 0) * 100) / 100,
    }))

    const staffRawItems = rawItems.filter((item) => !protectedIds.has(Number(item?.id || 0)) && String(item?.source_type || '') !== 'consultation')
    if (staffRawItems.some((item) => String(item?.item_type || '').toLowerCase() === 'service' || Number(item?.catalog_service_id || 0) > 0)) {
      await conn.rollback()
      return res.status(400).json({ message: 'Clinic services must come from the Doctor consultation. Staff can add only Medicine / Supply or Custom Charge items at Checkout.', code: 'STAFF_SERVICE_NOT_ALLOWED' })
    }
    for (const item of staffRawItems) {
      if (String(item?.item_type || '').toLowerCase() === 'custom' && !String(item?.notes || '').trim()) {
        await conn.rollback()
        return res.status(400).json({ message: 'Every custom charge requires a reason or note for the audit trail.', code: 'CUSTOM_CHARGE_REASON_REQUIRED' })
      }
    }
    const normalizedStaffItems = await normalizeBillingItems(staffRawItems.map((item) => ({
      ...item,
      source_type: String(item?.item_type || '').toLowerCase() === 'supply' ? 'staff_supply' : 'staff_custom',
      source_reference_id: null,
    })), conn)

    const allItems = [...securedConsultationItems, ...normalizedStaffItems]
    if (!allItems.length) { await conn.rollback(); return res.status(400).json({ message: 'Add at least one bill item.' }) }

    const supplyChecks = await validateStaffSupplyAvailability(normalizedStaffItems, conn)
    const insufficient = supplyChecks.find((item) => !item.sufficient)
    if (insufficient) {
      await conn.rollback()
      return res.status(409).json({
        code: 'INVENTORY_INSUFFICIENT',
        message: `${insufficient.name} requires ${insufficient.requested} ${insufficient.unit || 'unit(s)'}, but only ${insufficient.available} is currently available for dispensing.`,
        inventory_id: insufficient.inventory_id,
        requested: insufficient.requested,
        available: insufficient.available,
      })
    }

    const subtotalOnly = computeBillingTotals({ items: allItems, discount_amount: 0 })
    const discount = await resolveDiscountForDraft({
      billingId,
      billVersion: expectedVersion,
      subtotal: subtotalOnly.subtotal,
      presetId: req.body.discount_preset_id,
      reference: req.body.discount_reference,
      requestedAmount: req.body.discount_amount,
    }, conn, { allowDirectAdmin: isAdminActor })
    const totals = computeBillingTotals({ items: allItems, discount_amount: discount.amount })
    const nextVersion = expectedVersion + 1

    await replaceStaffBillingItems(billingId, securedConsultationItems, normalizedStaffItems, conn)
    const [billUpdate] = await conn.query(
      `UPDATE billing_records
       SET status = 'draft', subtotal = ?, discount_type = ?, discount_label = ?, discount_reference = ?, discount_amount = ?, total_amount = ?, payment_notes = ?, version = ?
       WHERE id = ? AND version = ?`,
      [totals.subtotal, discount.type, discount.label, discount.preset ? (String(req.body.discount_reference || '').trim() || null) : null, totals.discount_amount, totals.total_amount, paymentNotes, nextVersion, billingId, expectedVersion]
    )
    if (Number(billUpdate.affectedRows || 0) !== 1) {
      const err = new Error('This bill changed while it was being saved. Reload the latest version and try again.')
      err.statusCode = 409; err.code = 'BILL_VERSION_CONFLICT'; throw err
    }

    // Pending requests for the old revision are no longer safe after a material save.
    await conn.query(
      `UPDATE billing_adjustment_requests
       SET status = 'expired', resolved_at = NOW(), admin_note = COALESCE(admin_note, 'Bill changed after this request was submitted.')
       WHERE billing_id = ? AND bill_version = ? AND status = 'pending'`,
      [billingId, expectedVersion]
    )

    // Approved adjustments are intentionally not carried to the next bill version.
    // They authorize this save/finalization only; any later material edit requires a fresh approval.

    await writeAuditLog({
      userId: req.user.id, userRole: actorRole, action: 'billing.draft_updated', entityType: 'billing_record', entityId: billingId,
      oldValues: { version: expectedVersion, subtotal: currentBill.subtotal, discount_amount: currentBill.discount_amount, total_amount: currentBill.total_amount },
      newValues: { version: nextVersion, subtotal: totals.subtotal, discount_type: discount.type, discount_label: discount.label, discount_amount: totals.discount_amount, total_amount: totals.total_amount },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message, code: err.code || undefined, current_version: err.current_version })
    throw err
  } finally { conn.release() }
  res.json(await getBillingRecordWithItems(billingId))
}

const getBillingAdjustmentRequests = async (req, res) => {
  const billingId = Number(req.params.id)
  const [rows] = await db.query(
    `SELECT bar.*, dp.label AS discount_label
     FROM billing_adjustment_requests bar
     LEFT JOIN discount_presets dp ON dp.id = bar.discount_preset_id
     WHERE bar.billing_id = ? ORDER BY bar.created_at DESC`, [billingId]
  )
  res.json(rows)
}

const requestBillingAdjustment = async (req, res) => {
  const billingId = Number(req.params.id)
  const type = String(req.body.request_type || '').trim()
  if (type !== 'discount') return res.status(400).json({ message: 'Only discount approval requests are supported.', code: 'PRICE_OVERRIDE_REMOVED' })
  const bill = await getBillingRecordWithItems(billingId)
  if (!bill || !['draft', 'pending'].includes(bill.status)) return res.status(400).json({ message: 'Only draft bills can request adjustments.' })

  const currentVersion = Number(bill.version || 1)
  await db.query(
    `UPDATE billing_adjustment_requests SET status='expired', resolved_at=NOW(), admin_note=COALESCE(admin_note,'Bill changed after this request was submitted.')
     WHERE billing_id=? AND status='pending' AND bill_version<>?`,
    [billingId, currentVersion]
  )

  let discountPresetId = null, catalogServiceId = null, requestedAmount = null, requestedPrice = null
  discountPresetId = Number(req.body.discount_preset_id) || null
  const preset = await loadDiscountPreset(discountPresetId)
  if (!preset || Number(preset.is_active) === 0) return res.status(400).json({ message: 'Select a valid discount preset.' })
  requestedAmount = Math.max(0, Number(req.body.requested_amount) || 0) || null
  if (requestedAmount && requestedAmount > Number(bill.subtotal || 0) + 0.001) return res.status(400).json({ message: 'Requested discount cannot exceed the bill subtotal.' })
  const reason = String(req.body.reason || '').trim()
  const reference = String(req.body.reference || '').trim() || null
  if (!reason) return res.status(400).json({ message: 'A reason is required for administrator approval.' })

  const [existing] = await db.query(
    `SELECT id FROM billing_adjustment_requests WHERE billing_id=? AND bill_version=? AND staff_id=? AND request_type=? AND status='pending'
     AND COALESCE(discount_preset_id,0)=COALESCE(?,0) AND COALESCE(catalog_service_id,0)=COALESCE(?,0) LIMIT 1`,
    [billingId, currentVersion, req.user.id, type, discountPresetId, catalogServiceId]
  )
  if (existing.length) return res.status(409).json({ message: 'A matching approval request is already pending.' })

  const [result] = await db.query(
    `INSERT INTO billing_adjustment_requests
     (billing_id, bill_version, staff_id, request_type, discount_preset_id, catalog_service_id, requested_amount, requested_price, reference_text, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [billingId, currentVersion, req.user.id, type, discountPresetId, catalogServiceId, requestedAmount, requestedPrice, reference, reason]
  )
  await writeAuditLog({ userId:req.user.id,userRole:'staff',action:`billing.${type}_approval_requested`,entityType:'billing_adjustment_request',entityId:result.insertId,newValues:{billing_id:billingId,bill_version:currentVersion,discount_preset_id:discountPresetId,catalog_service_id:catalogServiceId,requested_amount:requestedAmount,requested_price:requestedPrice,reason},ipAddress:req.ip||null })
  broadcast(['admin'], 'billing_adjustment_requested', { requestId: result.insertId, billingId })
  res.status(201).json({ message: 'Administrator approval requested.', id: result.insertId, bill_version: currentVersion })
}

const cancelBillingAdjustmentRequest = async (req, res) => {
  const billingId = Number(req.params.id)
  const requestId = Number(req.params.requestId)
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT * FROM billing_adjustment_requests WHERE id=? AND billing_id=? AND staff_id=? LIMIT 1 FOR UPDATE`,
      [requestId, billingId, req.user.id]
    )
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Approval request not found.' }) }
    if (rows[0].status !== 'pending') { await conn.rollback(); return res.status(409).json({ message: 'Only a pending approval request can be cancelled.' }) }
    await conn.query("UPDATE billing_adjustment_requests SET status='cancelled', resolved_at=NOW(), admin_note='Cancelled by requesting staff.' WHERE id=?", [requestId])
    await writeAuditLog({ userId:req.user.id,userRole:'staff',action:'billing.adjustment_cancelled',entityType:'billing_adjustment_request',entityId:requestId,oldValues:{status:'pending'},newValues:{status:'cancelled'},ipAddress:req.ip||null }, conn)
    await conn.commit()
  } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  broadcast(['admin'], 'billing_adjustment_cancelled', { requestId, billingId })
  res.json({ message: 'Approval request cancelled.' })
}

const getFinalizePreview = async (req, res) => {
  const billingId = Number(req.params.id)
  const bill = await getBillingRecordWithItems(billingId)
  if (!bill) return res.status(404).json({ message: 'Billing record not found.' })
  if (!['draft','pending'].includes(bill.status)) return res.status(400).json({ message: 'Only a draft bill can be reviewed for confirmation.' })
  const directSupplies = (bill.items || []).filter((row) => row.item_type === 'supply' && row.source_type === 'staff_supply' && Number(row.source_inventory_id) > 0)
  const supplies = await validateStaffSupplyAvailability(directSupplies, db)
  res.json({
    billing_id: billingId,
    version: Number(bill.version || 1),
    total_amount: Number(bill.total_amount || 0),
    charge_count: (bill.items || []).length,
    supply_count: directSupplies.length,
    supplies,
    can_finalize: supplies.every((item) => item.sufficient),
  })
}

const finalizeBill = async (req, res) => {
  const actorRole = req.user?.role === 'admin' ? 'admin' : 'staff'
  const isAdminActor = actorRole === 'admin'
  const billingId = Number(req.params.id)
  const expectedVersion = Number(req.body.expected_version)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ message: 'Reload this bill before confirming it. A valid bill version is required.', code: 'BILL_VERSION_REQUIRED' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [lockedRows] = await conn.query('SELECT * FROM billing_records WHERE id=? LIMIT 1 FOR UPDATE', [billingId])
    if (!lockedRows.length) { await conn.rollback(); return res.status(404).json({ message: 'Billing record not found.' }) }
    const locked = lockedRows[0]
    if (!['draft','pending'].includes(locked.status)) { await conn.rollback(); return res.status(400).json({ message: 'Only draft bills can be confirmed.' }) }
    if (Number(locked.version || 1) !== expectedVersion) { await conn.rollback(); return res.status(409).json({ message: 'This bill changed before it could be confirmed. Review the latest version.', code: 'BILL_VERSION_CONFLICT', current_version:Number(locked.version||1) }) }
    const [[pendingApproval]] = await conn.query("SELECT COUNT(*) AS count FROM billing_adjustment_requests WHERE billing_id=? AND bill_version=? AND status='pending'", [billingId, expectedVersion])
    if (!isAdminActor && Number(pendingApproval?.count || 0) > 0) { await conn.rollback(); return res.status(409).json({ message: 'This bill still has a pending administrator approval. Resolve or cancel it before confirming the bill.', code: 'PENDING_BILLING_APPROVAL' }) }

    const bill = await getBillingRecordWithItems(billingId, conn)
    if (!Array.isArray(bill.items) || bill.items.length === 0) { await conn.rollback(); return res.status(400).json({ message: 'Add at least one bill item before confirming.' }) }

    const directSupplies = bill.items.filter((item) => item.item_type === 'supply' && item.source_type === 'staff_supply' && Number(item.source_inventory_id) > 0)
    for (const item of directSupplies) {
      const [inventoryRows] = await conn.query('SELECT id, name, unit, base_unit, unit_size FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE', [item.source_inventory_id])
      if (!inventoryRows.length) throw Object.assign(new Error(`Inventory item for ${item.service_name} is no longer available.`), { statusCode:400 })
      const inventoryItem = inventoryRows[0]
      const details = item.details || {}
      const usageUnit = String(details?.unit || inventoryItem.unit || '').trim().toLowerCase()
      const baseUnit = String(inventoryItem.base_unit || '').trim().toLowerCase()
      const unitSize = Math.max(1, Number(inventoryItem.unit_size) || 1)
      const requestedQty = Math.max(0, Number(item.quantity) || 0)
      const packageQty = usageUnit && baseUnit && usageUnit === baseUnit ? requestedQty / unitSize : requestedQty
      const consumption = await consumeInventoryFromLocationFEFO(inventoryItem.id, packageQty, 'Dispensing Area', conn, { fallbackLocation: 'Main Stockroom' })
      if (!consumption.ok) { await conn.rollback(); return res.status(400).json({ message: `Not enough stock for ${inventoryItem.name}. ${consumption.message}`, code:'INSUFFICIENT_STOCK' }) }

      let remainingUsageQty = requestedQty
      for (const batch of consumption.consumed) {
        const batchUsageQty = usageUnit && baseUnit && usageUnit === baseUnit ? Number(batch.quantity || 0) * unitSize : Number(batch.quantity || 0)
        const allocatedUsage = Math.min(remainingUsageQty, batchUsageQty); remainingUsageQty = Math.max(0, remainingUsageQty - allocatedUsage)
        const batchLabel = batch.batch_code || `Batch #${batch.batch_id}`
        await conn.query(
          `INSERT INTO billing_item_batch_usage (billing_id, billing_item_id, inventory_id, batch_id, package_quantity, usage_quantity, usage_unit_label, movement_type, source_location)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'dispensed', ?)`,
          [bill.id, item.id || null, inventoryItem.id, batch.batch_id, Number(batch.quantity || 0), allocatedUsage, details?.unit || inventoryItem.unit, batch.location || 'Dispensing Area']
        )
        await conn.query(
          `INSERT INTO inventory_logs (inventory_id, staff_id, admin_id, type, qty, note, movement_type, reference_type, reference_id, batch_id, from_location)
           VALUES (?, ?, ?, 'out', ?, ?, 'dispensed', 'billing_record', ?, ?, ?)`,
          [inventoryItem.id, isAdminActor ? null : req.user.id, isAdminActor ? req.user.id : null, Number(batch.quantity || 0), `${batchLabel} dispensed for billing record ${bill.id}: ${item.service_name}`, String(bill.id), batch.batch_id, batch.location || 'Dispensing Area']
        )
      }
    }

    const nextVersion = expectedVersion + 1
    const [updated] = await conn.query(
      `UPDATE billing_records SET status='ready', finalized_at=NOW(), finalized_by_staff_id=?, finalized_by_admin_id=?, version=? WHERE id=? AND version=?`,
      [isAdminActor ? null : req.user.id, isAdminActor ? req.user.id : null, nextVersion, billingId, expectedVersion]
    )
    if (Number(updated.affectedRows || 0) !== 1) throw Object.assign(new Error('This bill changed while it was being confirmed. Reload and try again.'), { statusCode:409, code:'BILL_VERSION_CONFLICT' })
    await conn.query("UPDATE billing_adjustment_requests SET status='expired', resolved_at=NOW(), admin_note=COALESCE(admin_note,'Bill was finalized before this request was used.') WHERE billing_id=? AND status='pending'", [billingId])
    await writeAuditLog({ userId:req.user.id,userRole:actorRole,action:'billing.finalized',entityType:'billing_record',entityId:billingId,oldValues:{status:locked.status,version:expectedVersion},newValues:{status:'ready',version:nextVersion,total_amount:bill.total_amount,dispensed_items:directSupplies.length},ipAddress:req.ip||null }, conn)
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    if (err.statusCode) return res.status(err.statusCode).json({ message:err.message, code:err.code || undefined })
    throw err
  } finally { conn.release() }
  broadcast(['admin','staff'], 'billing_finalized', { billingId })
  res.json(await getBillingRecordWithItems(billingId))
}

const payBill = async (req, res) => {
  const actorRole = req.user?.role === 'admin' ? 'admin' : 'staff'
  const isAdminActor = actorRole === 'admin'
  const billingId = Number(req.params.id)
  const paymentMethod = String(req.body.payment_method || '').trim().toLowerCase()
  const paymentNotes = String(req.body.payment_notes || '').trim() || null
  const referenceNumber = String(req.body.reference_number || '').trim() || null
  const idempotencyKey = String(req.body.idempotency_key || '').trim()
  if (!billingId) return res.status(400).json({ message: 'A valid billing record is required.' })
  if (!idempotencyKey || idempotencyKey.length > 100) return res.status(400).json({ message: 'A valid payment request key is required.' })
  if (!isValidPaymentMethod(paymentMethod)) return res.status(400).json({ message: 'Select a valid payment method.' })
  const paymentMethodColumns = { cash: 'cash_enabled', gcash: 'gcash_enabled', maya: 'maya_enabled', bank_transfer: 'bank_transfer_enabled' }
  const enabledColumn = paymentMethodColumns[paymentMethod]
  const [paymentSettingsRows] = await db.query(`SELECT ${enabledColumn} AS is_enabled FROM clinic_payment_settings WHERE id = 1 LIMIT 1`)
  if (paymentSettingsRows.length && Number(paymentSettingsRows[0].is_enabled) === 0) {
    return res.status(400).json({ message: `${paymentMethod.replace('_', ' ')} is currently disabled by an administrator.` })
  }
  if (requiresPaymentReference(paymentMethod) && !referenceNumber) return res.status(400).json({ message: 'Enter the payment reference number.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [duplicatePayments] = await conn.query('SELECT billing_id FROM billing_payments WHERE idempotency_key = ? LIMIT 1', [idempotencyKey])
    if (duplicatePayments.length) {
      const existingId = duplicatePayments[0].billing_id
      await conn.rollback()
      return res.json(await getBillingRecordWithItems(existingId))
    }

    if (requiresPaymentReference(paymentMethod) && referenceNumber) {
      const [duplicateRefs] = await conn.query(
        `SELECT id, billing_id, receipt_number FROM billing_payments
         WHERE payment_method = ? AND reference_number = ? AND status = 'completed' LIMIT 1 FOR UPDATE`,
        [paymentMethod, referenceNumber]
      )
      if (duplicateRefs.length) {
        await conn.rollback()
        return res.status(409).json({
          message: `This ${paymentMethod.replace('_', ' ')} reference was already recorded on receipt ${duplicateRefs[0].receipt_number}. Review the existing payment before continuing.`,
          code: 'DUPLICATE_PAYMENT_REFERENCE',
          existing_billing_id: duplicateRefs[0].billing_id,
          existing_receipt_number: duplicateRefs[0].receipt_number,
        })
      }
    }

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
    const paidAt = getClinicDateTimeSql()

    await conn.query(
      `INSERT INTO billing_payments
       (billing_id, amount, payment_method, reference_number, amount_received, change_amount, receipt_number, status, notes, received_by_staff_id, received_by_admin_id, idempotency_key, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
      [billingId, requestedPayment, paymentMethod, referenceNumber, tendered, paymentAmounts.changeAmount, receiptNumber, paymentNotes, isAdminActor ? null : req.user.id, isAdminActor ? req.user.id : null, idempotencyKey, paidAt]
    )
    await conn.query(
      `UPDATE billing_records
       SET status = ?, payment_method = ?, payment_notes = ?, confirmed_by_staff_id = ?, confirmed_by_admin_id = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END
       WHERE id = ?`,
      [nextStatus, paymentMethod, paymentNotes, isAdminActor ? null : req.user.id, isAdminActor ? req.user.id : null, nextStatus, paidAt, billingId]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: actorRole, action: 'billing.payment_received', entityType: 'billing_record', entityId: billingId,
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
     FROM discount_presets WHERE is_active = 1 ORDER BY created_at ASC, id ASC`
  )
  res.json(rows)
}

const getPaymentSettingsForStaff = async (req, res) => {
  const [rows] = await db.query(
    `SELECT cash_enabled, gcash_enabled, maya_enabled, bank_transfer_enabled,
            gcash_qr_url, maya_qr_url, gcash_qr_mode, maya_qr_mode,
            bank_name, bank_account_name, bank_account_number, updated_at
     FROM clinic_payment_settings WHERE id = 1 LIMIT 1`
  )
  res.json(rows[0] || {
    cash_enabled: 1, gcash_enabled: 1, maya_enabled: 1, bank_transfer_enabled: 1,
    gcash_qr_url: '', maya_qr_url: '', gcash_qr_mode: 'uploaded', maya_qr_mode: 'uploaded',
    bank_name: '', bank_account_name: '', bank_account_number: '', updated_at: null,
  })
}

const supplierSupportsClinic = (categoryValue, clinic) => String(categoryValue || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .includes(clinic)

const getInventoryMasterData = async (req, res) => {
  const category = ['medical','derma'].includes(String(req.query.category || '')) ? String(req.query.category) : null
  const [uoms] = await db.query('SELECT id,name,abbreviation FROM inventory_uoms WHERE is_active=1 ORDER BY sort_order,name')
  const [suppliers] = await db.query(`SELECT id,name,category FROM inventory_suppliers WHERE is_active=1 ${category ? "AND FIND_IN_SET(?, REPLACE(category,' ','')) > 0" : ''} ORDER BY name`, category ? [category] : [])
  const [locationTypes] = await db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types WHERE is_active=1 ORDER BY sort_order,name')
  const [movementReasons] = await db.query(`SELECT id,name,code,movement_type,requires_batch,is_system
                                            FROM inventory_movement_reasons WHERE is_active=1
                                            ORDER BY FIELD(movement_type,'in','out'),is_system DESC,name ASC`)
  res.json({ uoms, suppliers, location_types: locationTypes, movement_reasons: movementReasons })
}

const getInventory = async (req, res) => {
  const items = await loadInventoryRows()
  res.json(items)
}

const addInventoryItem = async (req, res) => {
  let {
    barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, unit_size, stock, threshold, price, supplier, supplier_id,
    expiration_date, batch_code, batch_lot_code, location_type_id,
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
    const setupSelection = await resolveInventorySetupSelection({ uom, location_type_id }, conn)
    uom = setupSelection.uom
    unit = uom
    base_unit = uom
    location_type_id = setupSelection.locationType.id
    if (!barcode) barcode = await nextInventoryBarcode(category, conn)
    if (batch_lot_code) batch_code = `${barcode}-${batch_lot_code}`
    if (supplier_id) {
      const [[supplierRow]] = await conn.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND is_active=1 LIMIT 1',[supplier_id])
      if (!supplierRow || !supplierSupportsClinic(supplierRow.category, category)) {
        const error = new Error('Selected supplier is not assigned to this item clinic.')
        error.statusCode = 400
        error.code = 'SUPPLIER_CLINIC_MISMATCH'
        throw error
      }
      supplier = supplierRow.name
    }
    const [result] = await conn.query(
      `INSERT INTO inventory
       (barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, unit_size, stock, threshold, price, supplier, supplier_id, expiration_date, storage_location, location_type_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, 1, 0, threshold, price, supplier, supplier_id, null, null, location_type_id]
    )
    let openingBatchId = null
    let openingLocation = 'Main Stockroom'
    if (stock > 0) {
      const received = await receiveInventoryBatch(result.insertId, {
        quantity: stock,
        expiration_date,
        batch_code,
        unit_cost: price,
        note: 'Opening stock',
        location: 'Main Stockroom',
      }, conn)
      openingBatchId = received.batch_id
      batch_code = received.batch_code
      expiration_date = received.expiration_date
      openingLocation = received.location || openingLocation
    }
    await syncInventorySnapshot(result.insertId, conn)
    if (stock > 0 && openingBatchId) {
      await conn.query(
        `INSERT INTO inventory_logs (inventory_id, staff_id, type, qty, note, movement_type, batch_id, to_location)
         VALUES (?, ?, 'in', ?, ?, 'received', ?, ?)`,
        [
          result.insertId,
          req.user.id,
          stock,
          `Opening stock · ${batch_code || `Batch #${openingBatchId}`}${expiration_date ? ` · expires ${expiration_date}` : ''}`,
          openingBatchId,
          openingLocation,
        ]
      )
    }
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'staff',
      action: 'inventory.item_created',
      entityType: 'inventory_item',
      entityId: result.insertId,
      newValues: { name, category, item_type, barcode, uom, supplier_id, location_type_id, initial_quantity: Number(stock || 0), opening_batch_id: openingBatchId, opening_batch_code: batch_code || null, expiration_date: expiration_date || null },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    const rows = await loadInventoryRows(db, 'WHERE id = ?', [result.insertId])
    return res.status(201).json(rows[0])
  } catch (err) {
    await conn.rollback()
    if (err?.statusCode) return res.status(err.statusCode).json({ message: err.message, code: err.code || null })
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
  let {
    barcode, name, category, item_type, uom, dosage_form, strength, threshold, price, supplier, supplier_id, location_type_id,
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

    const setupSelection = await resolveInventorySetupSelection({ uom, location_type_id }, conn)
    const canonicalUom = setupSelection.uom
    location_type_id = setupSelection.locationType.id

    if (supplier_id) {
      const [[supplierRow]] = await conn.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND is_active=1 LIMIT 1',[supplier_id])
      if (!supplierRow || !supplierSupportsClinic(supplierRow.category, category)) {
        const error = new Error('Selected supplier is not assigned to this item clinic.')
        error.statusCode = 400
        error.code = 'SUPPLIER_CLINIC_MISMATCH'
        throw error
      }
      supplier = supplierRow.name
    }

    await conn.query(
      `UPDATE inventory
       SET barcode=?, name=?, category=?, item_type=?, uom=?, dosage_form=?, strength=?, unit=?, base_unit=?, unit_size=1, threshold=?, price=?, supplier=?, supplier_id=?, location_type_id=?
       WHERE id=?`,
      [barcode, name, category, item_type, canonicalUom, dosage_form, strength, canonicalUom, canonicalUom, threshold, price, supplier, supplier_id, location_type_id, req.params.id]
    )
    await syncInventorySnapshot(req.params.id, conn)
    await conn.commit()
    const updated = await loadInventoryRows(db, 'WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    await conn.rollback()
    if (err?.statusCode) return res.status(err.statusCode).json({ message: err.message, code: err.code || null })
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
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await applyManualInventoryMovement({
      inventoryId: req.params.id,
      body: req.body,
      actorRole: 'staff',
      actorId: req.user.id,
      ipAddress: req.ip,
      executor: conn,
    })
    await conn.commit()
    const updated = await loadInventoryRows(db, 'WHERE id = ?', [req.params.id])
    res.json(updated[0])
  } catch (err) {
    await conn.rollback()
    if (err?.statusCode) return res.status(err.statusCode).json({ message: err.message, code: err.code || null, existing_batch_id: err.existingBatchId || null })
    throw err
  } finally {
    conn.release()
  }
}


const getInventoryLocations = async (req,res) => {
  const [rows] = await db.query(`SELECT l.id,l.name,l.location_type,l.is_active,l.created_at,
      COUNT(DISTINCT CASE WHEN ilb.quantity>0 THEN ilb.inventory_id END) AS item_count,
      COUNT(DISTINCT CASE WHEN ilb.quantity>0 THEN ilb.batch_id END) AS batch_count
    FROM inventory_locations l
    LEFT JOIN inventory_location_batches ilb ON ilb.location_id=l.id
    GROUP BY l.id ORDER BY l.is_active DESC,l.name`)
  res.json(rows)
}

const createInventoryLocation = async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const type = ['stockroom','room','dispensing','storage'].includes(String(req.body?.location_type || '')) ? String(req.body.location_type) : 'storage'
  if (!name) return res.status(400).json({ message: 'Location name is required.' })
  try {
    const [result] = await db.query('INSERT INTO inventory_locations (name,location_type,is_active) VALUES (?,?,1)', [name,type])
    await writeAuditLog({ userId:req.user.id,userRole:'staff',action:'inventory.location_created',entityType:'inventory_location',entityId:result.insertId,newValues:{name,location_type:type},ipAddress:req.ip||null }).catch(()=>{})
    res.status(201).json({ id: result.insertId, name, location_type: type, is_active: 1 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That storage location already exists.' })
    throw err
  }
}

const updateInventoryLocation = async (req,res) => {
  const id = Number(req.params.id)
  const name = String(req.body?.name || '').trim()
  const type = ['stockroom','room','dispensing','storage'].includes(String(req.body?.location_type || '')) ? String(req.body.location_type) : 'storage'
  if(!id || !name) return res.status(400).json({message:'Location name is required.'})
  const [[existing]] = await db.query('SELECT * FROM inventory_locations WHERE id=? LIMIT 1',[id])
  if(!existing) return res.status(404).json({message:'Storage location not found.'})
  try {
    await db.query('UPDATE inventory_locations SET name=?,location_type=? WHERE id=?',[name,type,id])
    await writeAuditLog({userId:req.user.id,userRole:'staff',action:'inventory.location_updated',entityType:'inventory_location',entityId:id,oldValues:existing,newValues:{name,location_type:type},ipAddress:req.ip||null}).catch(()=>{})
    const [[row]] = await db.query('SELECT id,name,location_type,is_active FROM inventory_locations WHERE id=?',[id])
    res.json(row)
  } catch(err){ if(err.code==='ER_DUP_ENTRY') return res.status(409).json({message:'That storage location already exists.'}); throw err }
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
       clinic_type,
       is_active,
       clinic_type AS type
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

const getDoctorAvailabilityForStaff = async (req, res) => {
  const doctorId = Number(req.params.id)
  if (!doctorId) return res.status(400).json({ message: 'A valid doctor is required.' })
  const startDate = String(req.query.start_date || '').trim() || undefined
  if (startDate && !isValidDateOnly(startDate)) return res.status(400).json({ message: 'A valid start date is required.' })
  const result = await buildDoctorAvailabilitySummary({
    doctorId,
    startDate,
    days: Math.min(14, Math.max(1, Number(req.query.days) || 14)),
  })
  const doctor = result.doctors?.[0]
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' })
  res.json({ start_date: result.start_date, end_date: result.end_date, days: result.days, doctor })
}

const getWalkInDoctors = async (req, res) => {
  const clinicType = String(req.query.clinic_type || '').trim()
  if (!['medical', 'derma'].includes(clinicType)) {
    return res.status(400).json({ message: 'Select a valid clinic type.' })
  }
  res.json(await buildWalkInDoctorAvailability({ clinicType }))
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
    note: req.body.note,
  })
  res.status(result.statusCode).json(result.body)
}

module.exports = {
  login, checkAuth, logout,
  getDashboard,
  getAppointments, createAppointment, confirmAppointment, cancelAppointment, markAppointmentNoShow, rescheduleAppointment, getAppointmentReasons,
  getQueue, getQueuePrecheck, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord, createWalkInPatient,
  getBills, getBillingCatalogForStaff, getBillById, updateBill, getFinalizePreview, finalizeBill, payBill, confirmBillPayment, getDiscountPresets, getBillingAdjustmentRequests, requestBillingAdjustment, cancelBillingAdjustmentRequest, getPaymentSettingsForStaff,
  getInventory, getInventoryMasterData, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock, getInventoryLocations, createInventoryLocation, updateInventoryLocation,
  getDoctors, getDoctorSchedules, getDoctorAvailabilityForStaff, getWalkInDoctors, getDoctorUnavailableDatesForStaff,
  getSupplyRequests, resolveSupplyRequest,
}
