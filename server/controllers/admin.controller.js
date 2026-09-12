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
const {
  createPaymentQrUploadSignature,
  getPerceptionPointScanStatus,
  cloudinaryUploadBuffer,
  issueScanPendingToken,
  issueBypassAuthorizationToken,
  issueAcceptedUploadToken,
  verifyUploadSecurityToken,
  hashUploadBuffer,
} = require('../utils/cloudinarySecurity')

const db           = require('../db/connect')
const bcrypt       = require('bcrypt')
const jwt          = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { issueSession, verifySessionToken, revokeSessions } = require('../utils/sessionSecurity')
const { requestAdminMfa, verifyAdminMfa } = require('../utils/accountSecurity')
const { makeTemporaryPassword } = require('../utils/securityCrypto')
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
const { getTodayDateOnly, getCurrentTimeLabel, addDaysDateOnly } = require('../utils/date')
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
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition } = require('../utils/appointmentSecurity')
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
  selling_price: body.selling_price === '' || body.selling_price === null || body.selling_price === undefined ? null : Math.max(0, Number(body.selling_price) || 0),
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

const makeTempPassword = () => makeTemporaryPassword(14)

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
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' })

  const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email])
  if (rows.length === 0) {
    await writeAuditLog({ userRole: 'admin', action: 'auth.login_failed', entityType: 'admin', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  const admin = rows[0]
  const match = await bcrypt.compare(password, admin.password)
  if (!match) {
    await writeAuditLog({ userId: admin.id, userRole: 'admin', action: 'auth.login_failed', entityType: 'admin', entityId: admin.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  if (String(process.env.ADMIN_MFA_ENABLED || 'true').toLowerCase() !== 'false') {
    await requestAdminMfa(admin)
    await writeAuditLog({ userId: admin.id, userRole: 'admin', action: 'auth.mfa_challenge_sent', entityType: 'admin', entityId: admin.id, ipAddress: req.ip || null }).catch(() => {})
    const pendingToken = jwt.sign(
      { id: admin.id, role: 'admin_mfa', session_version: Number(admin.session_version || 1) },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    )
    res.cookie('admin_mfa_pending', pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    })
    return res.json({ message: 'Security code sent to your administrator email.', mfa_required: true })
  }

  await issueSession(res, 'admin', admin.id)
  await writeAuditLog({ userId: admin.id, userRole: 'admin', action: 'auth.login_success', entityType: 'admin', entityId: admin.id, ipAddress: req.ip || null }).catch(() => {})
  return res.status(200).json({
    message: 'Login successful.',
    user: { id: admin.id, full_name: admin.full_name, email: admin.email, role: 'admin', theme_preference: admin.theme_preference, profile_image_url: admin.profile_image_url },
  })
}

const verifyLoginMfa = async (req, res) => {
  const pending = req.cookies?.admin_mfa_pending
  if (!pending) return res.status(401).json({ message: 'Administrator sign-in session expired. Please sign in again.' })
  try {
    const decoded = jwt.verify(pending, process.env.JWT_SECRET)
    if (decoded.role !== 'admin_mfa') return res.status(401).json({ message: 'Invalid sign-in session.' })
    const [rows] = await db.query('SELECT id, full_name, email, theme_preference, profile_image_url, COALESCE(session_version,1) AS session_version FROM admins WHERE id = ? LIMIT 1', [decoded.id])
    if (!rows.length || Number(decoded.session_version || 0) !== Number(rows[0].session_version || 1)) {
      return res.status(401).json({ message: 'Administrator sign-in session expired. Please sign in again.' })
    }
    await verifyAdminMfa(decoded.id, req.body?.code)
    await issueSession(res, 'admin', decoded.id)
    await writeAuditLog({ userId: decoded.id, userRole: 'admin', action: 'auth.mfa_verified', entityType: 'admin', entityId: decoded.id, ipAddress: req.ip || null }).catch(() => {})
    await writeAuditLog({ userId: decoded.id, userRole: 'admin', action: 'auth.login_success', entityType: 'admin', entityId: decoded.id, ipAddress: req.ip || null }).catch(() => {})
    res.clearCookie('admin_mfa_pending', { path: '/' })
    const admin = rows[0]
    return res.json({
      message: 'Login successful.',
      user: { id: admin.id, full_name: admin.full_name, email: admin.email, role: 'admin', theme_preference: admin.theme_preference, profile_image_url: admin.profile_image_url },
    })
  } catch (err) {
    return res.status(400).json({ message: err.message === 'jwt expired' ? 'Administrator sign-in session expired. Please sign in again.' : (err.message || 'Invalid security code.') })
  }
}

const checkAuth = async (req, res) => {
  const token = req.cookies['admin_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = await verifySessionToken(token, 'admin')
    const [rows] = await db.query('SELECT id, full_name, email, theme_preference, profile_image_url FROM admins WHERE id = ?', [decoded.id])
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'admin' } })
  } catch {
    res.clearCookie('admin_token', { path: '/' })
    res.status(200).json({ authenticated: false })
  }
}

const logout = async (req, res) => {
  await writeAuditLog({ userId: req.user?.id || null, userRole: 'admin', action: 'auth.logout', entityType: 'admin', entityId: req.user?.id || null, ipAddress: req.ip || null }).catch(() => {})
  res.clearCookie('admin_token', { path: '/' })
  res.clearCookie('admin_mfa_pending', { path: '/' })
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
  assertAppointmentTransition(rows[0].status, 'confirmed')
  await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [id])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'appointment.confirmed',entityType:'appointment',entityId:id,oldValues:{status:rows[0].status},newValues:{status:'confirmed'},ipAddress:req.ip||null }).catch(() => {})
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
  assertAppointmentTransition(rows[0].status, 'cancelled')
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'appointment.cancelled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'cancelled'},ipAddress:req.ip||null }).catch(() => {})
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
  assertAppointmentTransition(rows[0].status, 'no_show')
  await db.query("UPDATE appointments SET status = 'no_show' WHERE id = ?", [req.params.id])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'appointment.no_show',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'no_show'},ipAddress:req.ip||null }).catch(() => {})
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

  assertAppointmentTransition(rows[0].status, 'rescheduled')
  await withAppointmentSlotLock({ doctorId: rows[0].doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: rows[0].doctor_id, clinicType: rows[0].clinic_type, date: normalizedDate, time: appointment_time, excludeAppointmentId: req.params.id })
    await db.query(
      "UPDATE appointments SET appointment_date=?, appointment_time=?, status='confirmed' WHERE id=?",
      [normalizedDate, appointment_time, req.params.id]
    )
  })
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'appointment.rescheduled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'confirmed',appointment_date:normalizedDate,appointment_time},ipAddress:req.ip||null }).catch(() => {})
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

  const result = await withAppointmentSlotLock({ doctorId: doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: doctor_id, clinicType: clinic_type, date: normalizedDate, time: appointment_time })
    const [inserted] = await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, notes, appointment_source) VALUES (?,?,?,?,?,?,?,?)',
      [patient_id, doctor_id, clinic_type, reason || null, normalizedDate, appointment_time, notes || null, 'admin_booking']
    )
    return inserted
  })
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
  const tempPassword = makeTempPassword()
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
  const tempPassword = makeTempPassword()
  const hashed = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    'INSERT INTO staff (full_name, email, phone, password, role, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [full_name, email, normalizedPhone, hashed, 'staff', 'active']
  )
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?', [result.insertId])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'account.staff_created',entityType:'staff',entityId:result.insertId,newValues:{full_name,email,phone:normalizedPhone,status:'active',must_change_password:true},ipAddress:req.ip||null }).catch(() => {})
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
  await db.query('UPDATE staff SET status = ?, session_version = COALESCE(session_version,1) + 1 WHERE id = ?', [newStatus, req.params.id])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:`account.staff_${newStatus === 'active' ? 'enabled' : 'disabled'}`,entityType:'staff',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:newStatus,sessions_revoked:true},ipAddress:req.ip||null }).catch(() => {})
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
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'account.staff_updated',entityType:'staff',entityId:req.params.id,newValues:{full_name,email,phone:normalizedPhone},ipAddress:req.ip||null }).catch(() => {})
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
  const tempPassword = makeTempPassword()
  const hashed = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    // FIX 3: save prc_license (requires migration_add_prc_license.sql)
    'INSERT INTO doctors (full_name, email, phone, specialty, prc_license, password, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [full_name, email, normalizedPhone, specialty || null, prc_license || null, hashed]
  )
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, specialty, prc_license, is_active, created_at FROM doctors WHERE id = ?', [result.insertId]
  )
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'account.doctor_created',entityType:'doctor',entityId:result.insertId,newValues:{full_name,email,phone:normalizedPhone,specialty,prc_license,is_active:true,must_change_password:true},ipAddress:req.ip||null }).catch(() => {})
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
  await db.query('UPDATE doctors SET is_active = ?, session_version = COALESCE(session_version,1) + 1 WHERE id = ?', [newVal, req.params.id])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:`account.doctor_${newVal ? 'enabled' : 'disabled'}`,entityType:'doctor',entityId:req.params.id,oldValues:{is_active:rows[0].is_active},newValues:{is_active:newVal,sessions_revoked:true},ipAddress:req.ip||null }).catch(() => {})
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
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'account.doctor_updated',entityType:'doctor',entityId:req.params.id,newValues:{full_name,email,phone:normalizedPhone,specialty,prc_license},ipAddress:req.ip||null }).catch(() => {})
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
  const [doctorRows] = await db.query('SELECT full_name FROM doctors WHERE id = ? LIMIT 1', [doctorId])
  const [existing] = await db.query(
    'SELECT id, start_time, end_time, slot_duration_mins, is_active FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [doctorId, day_of_week]
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
  await writeAuditLog({
    userId: req.user.id, userRole: 'admin', action: 'schedule.updated', entityType: 'doctor_schedule', entityId: `${doctorId}:${day_of_week}`,
    oldValues: existing[0] || null,
    newValues: { doctor_id: Number(doctorId), doctor_name: doctorRows[0]?.full_name || null, day_of_week, start_time, end_time, slot_duration_mins: slot_duration_mins || 60, is_active: is_active ?? 1 },
    ipAddress: req.ip || null,
  }).catch(() => {})
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
  const [doctorRows] = await db.query('SELECT full_name FROM doctors WHERE id = ? LIMIT 1', [doctorId])
  await writeAuditLog({
    userId: req.user.id, userRole: 'admin', action: 'schedule.unavailable_date_saved', entityType: 'doctor_unavailable_date', entityId: `${doctorId}:${unavailableDate}`,
    newValues: { doctor_id: Number(doctorId), doctor_name: doctorRows[0]?.full_name || null, unavailable_date: unavailableDate, reason }, ipAddress: req.ip || null,
  }).catch(() => {})

  res.json({ message: 'Unavailable date saved.' })
}

const deleteDoctorUnavailableDateAdmin = async (req, res) => {
  const unavailableDate = toDateOnly(req.params.date)
  if (!isValidDateOnly(unavailableDate)) {
    return res.status(400).json({ message: 'A valid unavailable date is required.' })
  }

  const [doctorRows] = await db.query('SELECT full_name FROM doctors WHERE id = ? LIMIT 1', [req.params.id])
  await db.query(
    'DELETE FROM doctor_unavailable_dates WHERE doctor_id = ? AND unavailable_date = ?',
    [req.params.id, unavailableDate]
  )
  await writeAuditLog({
    userId: req.user.id, userRole: 'admin', action: 'schedule.unavailable_date_removed', entityType: 'doctor_unavailable_date', entityId: `${req.params.id}:${unavailableDate}`,
    newValues: { doctor_id: Number(req.params.id), doctor_name: doctorRows[0]?.full_name || null, unavailable_date: unavailableDate }, ipAddress: req.ip || null,
  }).catch(() => {})

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
    await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'billing.service_archived',entityType:'billing_service',entityId:req.params.serviceId,oldValues:{service_name:rows[0].service_name,is_active:1},newValues:{is_active:0,historical_usage:Number(usage.count)},ipAddress:req.ip||null }).catch(() => {})
    return res.json({ message: 'Service archived. Historical bills were preserved.', archived: true })
  }

  await db.query('DELETE FROM billing_service_catalog WHERE id = ?', [req.params.serviceId])
  await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'billing.service_deleted',entityType:'billing_service',entityId:req.params.serviceId,oldValues:rows[0],newValues:null,ipAddress:req.ip||null }).catch(() => {})
  res.json({ message: 'Service deleted.', archived: false })
}


const uploadPaymentQrImageAdmin = async (req, res) => {
  const provider = String(req.query?.provider || '').trim().toLowerCase()
  const scanMode = String(req.query?.scan_mode || 'scan').trim().toLowerCase() === 'bypass' ? 'bypass' : 'scan'
  if (!['gcash', 'maya'].includes(provider)) {
    return res.status(400).json({ message: 'Payment QR provider must be GCash or Maya.' })
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: 'Select a QR image to upload.' })
  }
  const fileHash = hashUploadBuffer(req.body)

  let bypassReason = null
  if (scanMode === 'bypass') {
    try {
      const bypass = verifyUploadSecurityToken(String(req.query?.bypass_token || ''), {
        stage: 'bypass_authorized',
        role: 'admin',
        user_id: req.user.id,
        context_type: 'payment_qr',
        context_id: provider,
      })
      if (!bypass.file_sha256 || bypass.file_sha256 !== fileHash) {
        return res.status(403).json({ message: 'The scanner-bypass authorization is for a different image. Retry the security scan for this file.' })
      }
      bypassReason = bypass.reason === 'usage_limit_reached' ? 'usage_limit_reached' : 'scanner_unavailable'
    } catch (error) {
      return res.status(error.statusCode || 403).json({ message: error.message || 'A valid scanner-unavailable authorization is required before bypassing the malware scan.' })
    }
  }

  let uploaded
  try {
    const signed = createPaymentQrUploadSignature({ adminId: req.user.id, provider, scanMode })
    uploaded = await cloudinaryUploadBuffer({
      buffer: req.body,
      mimeType: req.get('content-type'),
      fileName: req.get('x-file-name') || `${provider}-qr`,
      signed,
    })
  } catch (error) {
    if (scanMode === 'scan' && error.scannerUnavailable) {
      const reason = error.scannerReason === 'usage_limit_reached' ? 'usage_limit_reached' : 'scanner_unavailable'
      return res.json({
        status: 'unavailable',
        reason,
        message: reason === 'usage_limit_reached'
          ? 'The Perception Point malware-scanning usage limit has been reached. Scanning is unavailable until the allowance resets or the add-on plan is upgraded.'
          : 'The malware scanner is currently unavailable. Only continue if this QR image comes from a trusted source.',
        bypass_token: issueBypassAuthorizationToken({ role: 'admin', userId: req.user.id, contextType: 'payment_qr', contextId: provider, reason, fileHash }),
      })
    }
    return res.status(error.statusCode || 502).json({ message: error.message || 'QR image upload failed.' })
  }

  if (scanMode === 'bypass') {
    const securityToken = issueAcceptedUploadToken({
      role: 'admin', userId: req.user.id, contextType: 'payment_qr', contextId: provider,
      status: 'bypassed', assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id,
    })
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'security.payment_qr_scan_bypassed',
      entityType: 'clinic_payment_settings',
      entityId: '1',
      newValues: { provider, scan_status: 'bypassed', reason: bypassReason, asset_id: uploaded.asset_id },
      ipAddress: req.ip || null,
    }).catch(() => {})
    return res.json({
      status: 'bypassed',
      scan_status: 'bypassed',
      url: uploaded.secure_url,
      asset_id: uploaded.asset_id,
      public_id: uploaded.public_id,
      security_token: securityToken,
    })
  }

  return res.json({
    status: 'pending',
    url: uploaded.secure_url,
    asset_id: uploaded.asset_id,
    public_id: uploaded.public_id,
    scan_token: issueScanPendingToken({
      role: 'admin', userId: req.user.id, contextType: 'payment_qr', contextId: provider,
      assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id, fileHash,
    }),
  })
}

const getPaymentQrUploadScanStatusAdmin = async (req, res) => {
  const assetId = String(req.body?.asset_id || '').trim()
  const provider = String(req.body?.provider || '').trim().toLowerCase()
  const scanToken = String(req.body?.scan_token || '').trim()
  if (!assetId || !['gcash', 'maya'].includes(provider) || !scanToken) {
    return res.status(400).json({ message: 'Payment provider, Cloudinary asset ID, and scan verification are required.' })
  }

  let pending
  try {
    pending = verifyUploadSecurityToken(scanToken, {
      stage: 'scan_pending',
      role: 'admin',
      user_id: req.user.id,
      context_type: 'payment_qr',
      context_id: provider,
      asset_id: assetId,
    })
  } catch (error) {
    return res.status(error.statusCode || 403).json({ message: error.message || 'The scan verification is invalid.' })
  }

  const unavailable = (reason, message) => res.json({
    status: 'unavailable',
    reason,
    message,
    bypass_token: issueBypassAuthorizationToken({ role: 'admin', userId: req.user.id, contextType: 'payment_qr', contextId: provider, reason, fileHash: pending.file_sha256 }),
  })

  try {
    const result = await getPerceptionPointScanStatus(assetId)
    if (result.secure_url && pending.url && result.secure_url !== pending.url) {
      return res.status(409).json({ message: 'The scanned Cloudinary asset does not match this upload.' })
    }
    if (result.status === 'approved') {
      return res.json({
        ...result,
        security_token: issueAcceptedUploadToken({
          role: 'admin', userId: req.user.id, contextType: 'payment_qr', contextId: provider,
          status: 'approved', assetId, url: result.secure_url || pending.url, publicId: result.public_id || pending.public_id,
        }),
      })
    }
    if (result.status === 'rejected') {
      await writeAuditLog({
        userId: req.user.id,
        userRole: 'admin',
        action: 'security.payment_qr_upload_blocked',
        entityType: 'clinic_payment_settings',
        entityId: '1',
        newValues: { provider, scan_status: 'rejected', asset_id: assetId },
        ipAddress: req.ip || null,
      }).catch(() => {})
      return res.json(result)
    }
    if (result.status === 'unavailable') {
      return unavailable('scanner_unavailable', result.message || 'The malware scanner did not return a usable status.')
    }
    return res.json(result)
  } catch (error) {
    if (error.scannerUnavailable) {
      const reason = error.scannerReason === 'usage_limit_reached' ? 'usage_limit_reached' : 'scanner_unavailable'
      return unavailable(reason, reason === 'usage_limit_reached'
        ? 'The Perception Point malware-scanning usage limit has been reached. Scanning is unavailable until the allowance resets or the add-on plan is upgraded.'
        : 'The malware scanner status is currently unavailable. Only continue if this QR image comes from a trusted source.')
    }
    return res.status(error.statusCode || 500).json({ message: error.message || 'Could not check the security scan.' })
  }
}

const getPaymentSettingsAdmin = async (req, res) => {
  const [rows] = await db.query(
    `SELECT cash_enabled, gcash_enabled, maya_enabled, bank_transfer_enabled,
            gcash_qr_url, maya_qr_url, gcash_qr_scan_status, maya_qr_scan_status,
            gcash_qr_mode, maya_qr_mode,
            bank_name, bank_account_name, bank_account_number, updated_at
     FROM clinic_payment_settings WHERE id = 1 LIMIT 1`
  )
  res.json(rows[0] || {
    cash_enabled: 1,
    gcash_enabled: 0,
    maya_enabled: 0,
    bank_transfer_enabled: 0,
    gcash_qr_url: '',
    maya_qr_url: '',
    gcash_qr_scan_status: 'legacy',
    maya_qr_scan_status: 'legacy',
    gcash_qr_mode: 'uploaded',
    maya_qr_mode: 'uploaded',
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

  const enabledValue = (value) => (value === false || value === 0 || value === '0' ? 0 : 1)
  const cashEnabled = enabledValue(req.body.cash_enabled)
  const gcashEnabled = enabledValue(req.body.gcash_enabled)
  const mayaEnabled = enabledValue(req.body.maya_enabled)
  const bankEnabled = enabledValue(req.body.bank_transfer_enabled)
  const gcashQrMode = String(req.body.gcash_qr_mode || 'uploaded').toLowerCase() === 'external' ? 'external' : 'uploaded'
  const mayaQrMode = String(req.body.maya_qr_mode || 'uploaded').toLowerCase() === 'external' ? 'external' : 'uploaded'
  const bankName = String(req.body.bank_name || '').trim() || null
  const bankAccountName = String(req.body.bank_account_name || '').trim() || null
  const bankAccountNumber = String(req.body.bank_account_number || '').trim() || null

  if (![cashEnabled, gcashEnabled, mayaEnabled, bankEnabled].some(Boolean)) {
    return res.status(400).json({ code: 'PAYMENT_METHOD_REQUIRED', message: 'At least one payment method must remain enabled.' })
  }
  if (bankEnabled && (!bankName || !bankAccountName || !bankAccountNumber)) {
    return res.status(400).json({ code: 'BANK_DETAILS_REQUIRED', message: 'Complete the bank name, account name, and account number before enabling Bank Transfer.' })
  }
  if (gcashEnabled && gcashQrMode === 'uploaded' && !gcashQrUrl) {
    return res.status(400).json({ code: 'GCASH_QR_REQUIRED', message: 'Upload a GCash QR image or choose the physical/external QR option before enabling GCash.' })
  }
  if (mayaEnabled && mayaQrMode === 'uploaded' && !mayaQrUrl) {
    return res.status(400).json({ code: 'MAYA_QR_REQUIRED', message: 'Upload a Maya QR image or choose the physical/external QR option before enabling Maya.' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [oldRows] = await conn.query('SELECT * FROM clinic_payment_settings WHERE id = 1 LIMIT 1 FOR UPDATE')
    const oldSettings = oldRows[0] || {}

    const resolveQr = (provider, newUrl, qrMode) => {
      const urlKey = `${provider}_qr_url`
      const statusKey = `${provider}_qr_scan_status`
      const tokenKey = `${provider}_qr_security_token`
      if (qrMode === 'external') return { url: newUrl || null, status: newUrl ? String(oldSettings[statusKey] || 'legacy') : 'legacy' }
      if (!newUrl) return { url: null, status: 'legacy' }

      const oldUrl = String(oldSettings[urlKey] || '').trim()
      if (oldUrl && oldUrl === newUrl) {
        const preserved = ['approved', 'bypassed', 'legacy'].includes(String(oldSettings[statusKey] || '').toLowerCase())
          ? String(oldSettings[statusKey]).toLowerCase()
          : 'legacy'
        return { url: newUrl, status: preserved }
      }

      const verified = verifyUploadSecurityToken(req.body[tokenKey], {
        stage: 'accepted',
        role: 'admin',
        user_id: req.user.id,
        context_type: 'payment_qr',
        context_id: provider,
        url: newUrl,
      })
      if (!['approved', 'bypassed'].includes(String(verified.scan_status))) {
        throw Object.assign(new Error('The new payment QR has not completed the required upload security workflow.'), { statusCode: 400 })
      }
      return { url: newUrl, status: verified.scan_status }
    }

    const gcash = resolveQr('gcash', gcashQrUrl, gcashQrMode)
    const maya = resolveQr('maya', mayaQrUrl, mayaQrMode)
    const payload = {
      cash_enabled: cashEnabled,
      gcash_enabled: gcashEnabled,
      maya_enabled: mayaEnabled,
      bank_transfer_enabled: bankEnabled,
      gcash_qr_url: gcash.url,
      maya_qr_url: maya.url,
      gcash_qr_scan_status: gcash.status,
      maya_qr_scan_status: maya.status,
      gcash_qr_mode: gcashQrMode,
      maya_qr_mode: mayaQrMode,
      bank_name: bankName,
      bank_account_name: bankAccountName,
      bank_account_number: bankAccountNumber,
    }

    await conn.query(
      `INSERT INTO clinic_payment_settings
       (id, cash_enabled, gcash_enabled, maya_enabled, bank_transfer_enabled,
        gcash_qr_url, maya_qr_url, gcash_qr_scan_status, maya_qr_scan_status,
        gcash_qr_mode, maya_qr_mode, bank_name, bank_account_name, bank_account_number, updated_by_admin_id)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         cash_enabled = VALUES(cash_enabled),
         gcash_enabled = VALUES(gcash_enabled),
         maya_enabled = VALUES(maya_enabled),
         bank_transfer_enabled = VALUES(bank_transfer_enabled),
         gcash_qr_url = VALUES(gcash_qr_url),
         maya_qr_url = VALUES(maya_qr_url),
         gcash_qr_scan_status = VALUES(gcash_qr_scan_status),
         maya_qr_scan_status = VALUES(maya_qr_scan_status),
         gcash_qr_mode = VALUES(gcash_qr_mode),
         maya_qr_mode = VALUES(maya_qr_mode),
         bank_name = VALUES(bank_name),
         bank_account_name = VALUES(bank_account_name),
         bank_account_number = VALUES(bank_account_number),
         updated_by_admin_id = VALUES(updated_by_admin_id)`,
      [payload.cash_enabled, payload.gcash_enabled, payload.maya_enabled, payload.bank_transfer_enabled,
       payload.gcash_qr_url, payload.maya_qr_url, payload.gcash_qr_scan_status, payload.maya_qr_scan_status,
       payload.gcash_qr_mode, payload.maya_qr_mode, payload.bank_name, payload.bank_account_name, payload.bank_account_number, req.user.id]
    )
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'admin',
      action: 'billing.payment_settings_updated',
      entityType: 'clinic_payment_settings',
      entityId: '1',
      oldValues: oldSettings || null,
      newValues: payload,
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    if (error.statusCode && !res.headersSent) return res.status(error.statusCode).json({ message: error.message, code: error.code })
    throw error
  } finally {
    conn.release()
  }

  return getPaymentSettingsAdmin(req, res)
}

const recordReportExport = async (req, res) => {
  const startDate = String(req.body?.start_date || '').trim() || null
  const endDate = String(req.body?.end_date || '').trim() || null
  await writeAuditLog({
    userId: req.user.id,
    userRole: 'admin',
    action: 'reports.exported',
    entityType: 'report',
    entityId: startDate && endDate ? `${startDate}:${endDate}` : null,
    newValues: { start_date: startDate, end_date: endDate, format: 'print_pdf' },
    ipAddress: req.ip || null,
  }).catch(() => {})
  res.json({ message: 'Report export recorded.' })
}

const getReports = async (req, res) => {
  let range
  try { range = resolveReportRange(req.query) }
  catch (error) { return res.status(error.statusCode || 400).json({ message: error.message }) }
  const { startDate, endDate } = range
  const dateParams = [startDate, endDate]
  const clinicToday = getTodayDateOnly()
  const clinicNext30 = addDaysDateOnly(clinicToday, 30)

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
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date IS NOT NULL AND expiration_date < ?) AS expired,
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date BETWEEN ? AND ?) AS expiring_soon`,
    [clinicToday, clinicToday, clinicNext30])

  const [stockActivity] = await db.query(
    `SELECT DATE_FORMAT(logged_at, '%Y-%m') AS ym,
            DATE_FORMAT(MIN(logged_at), '%b %Y') AS month,
            SUM(CASE WHEN type = 'in' THEN 1 ELSE 0 END) AS stock_in_actions,
            SUM(CASE WHEN type = 'out' THEN 1 ELSE 0 END) AS stock_out_actions,
            COALESCE(SUM(CASE WHEN type = 'in' THEN qty ELSE 0 END), 0) AS stock_in,
            COALESCE(SUM(CASE WHEN type = 'out' THEN qty ELSE 0 END), 0) AS stock_out
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY DATE_FORMAT(logged_at, '%Y-%m') ORDER BY ym ASC`, dateParams)

  const [stockMovementByReason] = await db.query(
    `SELECT COALESCE(movement_type, CASE WHEN type='in' THEN 'received' ELSE 'adjustment' END) AS movement_reason,
            COUNT(*) AS actions, COALESCE(SUM(qty),0) AS quantity
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY COALESCE(movement_type, CASE WHEN type='in' THEN 'received' ELSE 'adjustment' END)
     ORDER BY quantity DESC`, dateParams)

  const [inventoryByCategory] = await db.query(
    `SELECT category, COUNT(*) AS items, COALESCE(SUM(stock), 0) AS total_stock,
            COALESCE(SUM(stock * COALESCE(price, 0)), 0) AS total_value
     FROM inventory GROUP BY category ORDER BY total_value DESC, category ASC`)

  const [[currentOperations]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE appointment_date = ? AND status IN ('pending','confirmed','rescheduled','in-progress')) AS today_remaining,
       (SELECT COUNT(*) FROM appointments WHERE appointment_date > ? AND status IN ('pending','confirmed','rescheduled')) AS future_confirmed,
       (SELECT COUNT(*) FROM appointments WHERE status = 'pending' AND appointment_date >= ?) AS awaiting_approval,
       (SELECT COUNT(*) FROM queue WHERE queue_date = ? AND status IN ('waiting','in-progress')) AS walkin_queue,
       (SELECT COUNT(*) FROM supply_requests WHERE status = 'pending') AS pending_supply_requests`,
    [clinicToday, clinicToday, clinicToday, clinicToday])

  const [[supplyRequests]] = await db.query(
    `SELECT SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected
     FROM supply_requests WHERE DATE(requested_at) BETWEEN ? AND ?`, dateParams)

  const [[billingSummary]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('draft','voided') THEN subtotal ELSE 0 END), 0) AS gross_billed,
       COALESCE(SUM(CASE WHEN status NOT IN ('draft','voided') THEN discount_amount ELSE 0 END), 0) AS discounts,
       COALESCE(SUM(CASE WHEN status NOT IN ('draft','voided') THEN total_amount ELSE 0 END), 0) AS net_billed,
       SUM(status = 'paid') AS paid_bills,
       SUM(status = 'partially_paid') AS partially_paid_bills,
       SUM(status IN ('pending','ready')) AS unpaid_bills,
       SUM(status = 'draft') AS draft_bills,
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
     WHERE b.status IN ('pending','ready','partially_paid')`)

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
     JOIN billing_records br ON br.id = bi.billing_id AND br.status NOT IN ('draft','voided')
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
    stockActivity, stockMovementByReason: stockMovementByReason.map(row => ({ ...row, movement_type: row.movement_reason })), inventoryByCategory,
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
      unpaid_bills: Number(billingSummary?.unpaid_bills || 0), pending_bills: Number(billingSummary?.unpaid_bills || 0), draft_bills: Number(billingSummary?.draft_bills || 0), voided_bills: Number(billingSummary?.voided_bills || 0),
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
    barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, selling_price, supplier,
    expiration_date, batch_code, storage_location,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO inventory
       (barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, selling_price, supplier, expiration_date, storage_location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, unit, base_unit, unit_size, 0, threshold, price, selling_price, supplier, null, storage_location]
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
      newValues: { name, category, barcode, stock_unit: unit, dispensing_unit: base_unit, units_per_package: unit_size, unit_cost: price, patient_selling_price: selling_price, opening_stock: Number(stock || 0), opening_batch_id: openingBatchId, opening_batch_code: batch_code || null, expiration_date: expiration_date || null },
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
    barcode, name, category, unit, base_unit, unit_size, threshold, price, selling_price, supplier,
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
       SET barcode=?, name=?, category=?, unit=?, base_unit=?, unit_size=?, threshold=?, price=?, selling_price=?, supplier=?, storage_location=?
       WHERE id=?`,
      [barcode, name, category, unit, base_unit, unit_size, threshold, price, selling_price, supplier, storage_location, req.params.id]
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
    note: req.body.note,
  })
  res.status(result.statusCode).json(result.body)
}

// ── Billing oversight / refunds / reconciliation ─────────────────────────────
const assertPaymentCashierShiftOpen = async (payment, executor) => {
  const staffId = Number(payment?.received_by_staff_id || 0)
  const paymentDate = String(payment?.paid_at || '').slice(0, 10)
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return

  await executor.query('SELECT id FROM staff WHERE id = ? FOR UPDATE', [staffId])
  const [closedRows] = await executor.query(
    `SELECT id FROM cashier_closings
     WHERE staff_id = ? AND closing_date = ?
       AND COALESCE(status,'closed') = 'closed'
       AND COALESCE(is_locked,1) = 1
     LIMIT 1`,
    [staffId, paymentDate]
  )
  if (closedRows.length) {
    const error = new Error('The cashier shift for this payment is closed. Reopen that cashier shift before voiding or refunding the payment.')
    error.statusCode = 409
    error.code = 'CASHIER_SHIFT_CLOSED'
    throw error
  }
}

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
            COALESCE(SUM(CASE WHEN status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS net_collected,
            COALESCE(SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END),0) AS voided_transactions,
            COALESCE(SUM(CASE WHEN payment_method='cash' AND status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS expected_cash
     FROM billing_payments WHERE DATE(paid_at)=?`, [date])
  const [[discounts]] = await db.query(
    `SELECT COALESCE(SUM(discount_amount),0) AS discounts FROM billing_records
     WHERE DATE(COALESCE(finalized_at,created_at))=? AND status <> 'voided'`, [date])
  const [closings] = await db.query(
    `SELECT cc.*, s.full_name AS staff_name
     FROM cashier_closings cc JOIN staff s ON s.id=cc.staff_id
     WHERE cc.closing_date=? ORDER BY cc.closed_at DESC, cc.id DESC`, [date])
  const [openShifts] = await db.query(
    `SELECT bp.received_by_staff_id AS staff_id, s.full_name AS staff_name,
            COUNT(*) AS payment_count,
            COALESCE(SUM(CASE WHEN bp.payment_method='cash' AND bp.status='completed' THEN bp.amount-COALESCE(bp.refund_amount,0) ELSE 0 END),0) AS expected_cash,
            COALESCE(cc.status,'open') AS status, cc.id AS closing_id, cc.reopened_at, cc.reopen_reason
     FROM billing_payments bp
     JOIN staff s ON s.id=bp.received_by_staff_id
     LEFT JOIN cashier_closings cc ON cc.staff_id=bp.received_by_staff_id AND cc.closing_date=DATE(bp.paid_at)
     WHERE DATE(bp.paid_at)=?
       AND NOT (COALESCE(cc.status,'')='closed' AND COALESCE(cc.is_locked,1)=1)
     GROUP BY bp.received_by_staff_id, s.full_name, cc.status, cc.id, cc.reopened_at, cc.reopen_reason
     ORDER BY s.full_name`, [date])
  const [events] = await db.query(
    `SELECT cce.*, s.full_name AS staff_name,
            CASE WHEN cce.actor_role='admin' THEN a.full_name WHEN cce.actor_role='staff' THEN st.full_name ELSE NULL END AS actor_name
     FROM cashier_closing_events cce
     JOIN cashier_closings cc ON cc.id=cce.cashier_closing_id
     JOIN staff s ON s.id=cc.staff_id
     LEFT JOIN admins a ON cce.actor_role='admin' AND a.id=cce.actor_id
     LEFT JOIN staff st ON cce.actor_role='staff' AND st.id=cce.actor_id
     WHERE cc.closing_date=?
     ORDER BY cce.created_at DESC`, [date])
  res.json({
    date,
    methods,
    summary: { ...summary, discounts: Number(discounts?.discounts || 0) },
    closings,
    open_shifts: openShifts,
    closing_events: events,
  })
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
    if (Number(payment.refund_amount || 0) > 0) {
      await conn.rollback()
      return res.status(409).json({ code: 'PAYMENT_ALREADY_REFUNDED', message: 'This payment already has a refund and can no longer be voided. Refund the remaining refundable amount instead.' })
    }
    await assertPaymentCashierShiftOpen(payment, conn)
    await conn.query(`UPDATE billing_payments SET status='voided', voided_at=NOW(), void_reason=? WHERE id=?`, [reason, paymentId])
    const bill = await getBillingRecordWithItems(billingId, conn)
    const paidAfter = Math.max(0, Number(bill.paid_amount || 0))
    const balanceAfter = Math.max(0, Number(bill.total_amount || 0) - paidAfter)
    const nextStatus = paidAfter <= 0 ? 'ready' : balanceAfter <= 0 ? 'paid' : 'partially_paid'
    await conn.query(`UPDATE billing_records SET status=?, paid_at=CASE WHEN ?='paid' THEN paid_at ELSE NULL END WHERE id=?`, [nextStatus, nextStatus, billingId])
    await writeAuditLog({ userId:req.user.id,userRole:'admin',action:'billing.payment_voided',entityType:'billing_payment',entityId:paymentId,oldValues:{status:'completed',amount:payment.amount},newValues:{status:'voided',reason,billing_status:nextStatus},ipAddress:req.ip||null },conn)
    await conn.commit()
  } catch(e){
    await conn.rollback()
    if (e.statusCode && !res.headersSent) return res.status(e.statusCode).json({ message: e.message, code: e.code })
    throw e
  } finally { conn.release() }
  broadcast(['admin','staff'], 'billing_payment_changed', { billingId, paymentId, action: 'voided' })
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
    await assertPaymentCashierShiftOpen(payment, conn)
    const available=Math.max(0,Number(payment.amount||0)-Number(payment.refund_amount||0))
    const amount=req.body.amount===undefined||req.body.amount===null||req.body.amount===''?available:Number(req.body.amount)
    if(!Number.isFinite(amount)||amount<=0||amount>available+0.001){
      await conn.rollback()
      return res.status(400).json({code:'INVALID_REFUND_AMOUNT',message:`Refund amount must be greater than zero and cannot exceed the refundable amount of ₱${available.toFixed(2)}.`,max_refundable:available})
    }
    const nextRefund=Math.round((Number(payment.refund_amount||0)+amount)*100)/100
    await conn.query(`UPDATE billing_payments SET refund_amount=?, refunded_at=NOW(), refund_reason=?, refunded_by_admin_id=? WHERE id=?`,[nextRefund,reason,req.user.id,paymentId])
    const bill=await getBillingRecordWithItems(billingId,conn)
    const paidAfter=Math.max(0,Number(bill.paid_amount||0))
    const balanceAfter=Math.max(0,Number(bill.total_amount||0)-paidAfter)
    const nextStatus=paidAfter<=0?'ready':balanceAfter<=0?'paid':'partially_paid'
    await conn.query(`UPDATE billing_records SET status=?, paid_at=CASE WHEN ?='paid' THEN paid_at ELSE NULL END WHERE id=?`,[nextStatus,nextStatus,billingId])
    await writeAuditLog({userId:req.user.id,userRole:'admin',action:'billing.payment_refunded',entityType:'billing_payment',entityId:paymentId,oldValues:{refund_amount:payment.refund_amount||0},newValues:{refund_amount:nextRefund,refund_delta:amount,reason,billing_status:nextStatus,balance_after:balanceAfter},ipAddress:req.ip||null},conn)
    await conn.commit()
  }catch(e){
    await conn.rollback()
    if (e.statusCode && !res.headersSent) return res.status(e.statusCode).json({ message: e.message, code: e.code })
    throw e
  }finally{conn.release()}
  broadcast(['admin','staff'], 'billing_payment_changed', { billingId, paymentId, action: 'refunded' })
  res.json(await getBillingRecordWithItems(billingId))
}

const getClinicSettingsAdmin = async (req,res) => {
  const [rows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1')
  res.json(rows[0]||{})
}
const updateClinicSettingsAdmin = async (req,res) => {
  const [oldRows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1')
  const current = oldRows[0] || {}
  const receiptTitle = req.body.receipt_title === undefined ? current.receipt_title : req.body.receipt_title
  const payload={
    clinic_name:String(req.body.clinic_name||'CARAIT MEDICAL AND DERMATOLOGY CLINIC').trim(),
    address:String(req.body.address||'').trim()||null, phone:String(req.body.phone||'').trim()||null,
    email:String(req.body.email||'').trim()||null, report_footer:String(req.body.report_footer||'').trim()||null,
    receipt_title:String(receiptTitle||'PAYMENT RECEIPT').trim()||'PAYMENT RECEIPT',
    receipt_footer:String(req.body.receipt_footer||'').trim()||null,
  }
  if(!payload.clinic_name)return res.status(400).json({message:'Clinic name is required.'})
  await db.query(`INSERT INTO clinic_settings (id,clinic_name,address,phone,email,report_footer,receipt_title,receipt_footer,updated_by_admin_id)
                  VALUES (1,?,?,?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE clinic_name=VALUES(clinic_name),address=VALUES(address),phone=VALUES(phone),email=VALUES(email),report_footer=VALUES(report_footer),receipt_title=VALUES(receipt_title),receipt_footer=VALUES(receipt_footer),updated_by_admin_id=VALUES(updated_by_admin_id)`,
                 [payload.clinic_name,payload.address,payload.phone,payload.email,payload.report_footer,payload.receipt_title,payload.receipt_footer,req.user.id])
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:'settings.clinic_updated',entityType:'clinic_settings',entityId:'1',oldValues:oldRows[0]||null,newValues:payload,ipAddress:req.ip||null})
  const [rows]=await db.query('SELECT * FROM clinic_settings WHERE id=1 LIMIT 1');res.json(rows[0])
}


const getBillingAdjustmentRequestsAdmin = async (req, res) => {
  const status = String(req.query.status || 'pending').trim()
  const params = []
  const filters = []
  if (status) { filters.push('bar.status = ?'); params.push(status) }
  if (req.query.request_type) { filters.push('bar.request_type = ?'); params.push(String(req.query.request_type)) }
  if (req.query.date_from) { filters.push('DATE(bar.created_at) >= ?'); params.push(String(req.query.date_from)) }
  if (req.query.date_to) { filters.push('DATE(bar.created_at) <= ?'); params.push(String(req.query.date_to)) }
  if (req.query.requested_by) { filters.push('bar.staff_id = ?'); params.push(Number(req.query.requested_by)) }
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`
    filters.push('(p.full_name LIKE ? OR s.full_name LIKE ? OR COALESCE(bsc.service_name,dp.label,\'\') LIKE ?)')
    params.push(q,q,q)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25))
  const offset = (page - 1) * limit
  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM billing_adjustment_requests bar
     JOIN staff s ON s.id = bar.staff_id
     JOIN billing_records br ON br.id = bar.billing_id
     JOIN patients p ON p.id = br.patient_id
     LEFT JOIN discount_presets dp ON dp.id = bar.discount_preset_id
     LEFT JOIN billing_service_catalog bsc ON bsc.id = bar.catalog_service_id
     ${where}`, params
  )
  const [rows] = await db.query(
    `SELECT bar.*, s.full_name AS staff_name, dp.label AS discount_label, dp.discount_type, dp.value AS discount_preset_value,
            bsc.service_name, br.patient_id, p.full_name AS patient_name,
            br.subtotal AS bill_subtotal, br.discount_amount AS bill_discount_amount, br.total_amount AS bill_total,
            br.version AS current_bill_version, br.status AS bill_status,
            (SELECT bi.unit_price FROM billing_items bi
             WHERE bi.billing_id=bar.billing_id AND bi.catalog_service_id=bar.catalog_service_id AND bi.source_type='consultation'
             ORDER BY bi.id LIMIT 1) AS current_price
     FROM billing_adjustment_requests bar
     JOIN staff s ON s.id = bar.staff_id
     JOIN billing_records br ON br.id = bar.billing_id
     JOIN patients p ON p.id = br.patient_id
     LEFT JOIN discount_presets dp ON dp.id = bar.discount_preset_id
     LEFT JOIN billing_service_catalog bsc ON bsc.id = bar.catalog_service_id
     ${where}
     ORDER BY bar.created_at DESC
     LIMIT ? OFFSET ?`, [...params, limit, offset]
  )
  res.json({ items: rows, pagination: { page, limit, total: Number(countRow?.total || 0), total_pages: Math.max(1, Math.ceil(Number(countRow?.total || 0) / limit)) } })
}

const resolveBillingAdjustmentRequestAdmin = async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body.status || '').trim()
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Status must be approved or rejected.' })
  const reason = String(req.body.admin_note || '').trim() || null
  if (status === 'rejected' && !reason) return res.status(400).json({ code:'REJECTION_REASON_REQUIRED', message:'A rejection reason is required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM billing_adjustment_requests WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Adjustment request not found.' }) }
    const request = rows[0]
    if (request.status !== 'pending') { await conn.rollback(); return res.status(409).json({ message: 'This adjustment request has already been resolved.' }) }
    const [billRows] = await conn.query('SELECT id,status,version FROM billing_records WHERE id=? FOR UPDATE', [request.billing_id])
    if (!billRows.length || !['draft','pending'].includes(String(billRows[0].status))) {
      await conn.query(`UPDATE billing_adjustment_requests SET status='expired', resolved_at=NOW(), admin_note=COALESCE(admin_note,'Bill is no longer editable.') WHERE id=?`, [id])
      await conn.commit()
      return res.status(409).json({ code:'ADJUSTMENT_EXPIRED', message:'This request expired because the bill is no longer editable.' })
    }
    if (Number(request.bill_version || 1) !== Number(billRows[0].version || 1)) {
      await conn.query(`UPDATE billing_adjustment_requests SET status='expired', resolved_at=NOW(), admin_note=COALESCE(admin_note,'Bill changed after request submission.') WHERE id=?`, [id])
      await conn.commit()
      return res.status(409).json({ code:'ADJUSTMENT_EXPIRED', message:'This request expired because the bill changed after it was submitted.' })
    }
    await conn.query(
      `UPDATE billing_adjustment_requests SET status=?, resolved_by_admin_id=?, resolved_at=NOW(), admin_note=? WHERE id=?`,
      [status, req.user.id, reason, id]
    )
    await writeAuditLog({ userId:req.user.id,userRole:'admin',action:`billing.adjustment_${status}`,entityType:'billing_adjustment_request',entityId:id,oldValues:{status:'pending'},newValues:{status,admin_note:reason,bill_version:request.bill_version},ipAddress:req.ip||null }, conn)
    await conn.commit()
  } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  broadcast(['admin', 'staff'], 'billing_adjustment_resolved', { requestId: id, status })
  const [updated] = await db.query('SELECT * FROM billing_adjustment_requests WHERE id = ?', [id])
  res.json(updated[0])
}

const reopenCashierShiftAdmin = async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body.reason || '').trim()
  if (!reason) return res.status(400).json({ message: 'A reopen reason is required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM cashier_closings WHERE id=? FOR UPDATE', [id])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Cashier closing not found.' }) }
    const closing = rows[0]
    if (String(closing.status || 'closed') !== 'closed' || Number(closing.is_locked ?? 1) !== 1) {
      await conn.rollback()
      return res.status(409).json({ message: 'This cashier shift is already open or reopened.' })
    }
    await conn.query(
      `UPDATE cashier_closings
       SET status='reopened', is_locked=0, reopened_at=NOW(), reopened_by_admin_id=?, reopen_reason=?
       WHERE id=?`, [req.user.id, reason, id]
    )
    await conn.query(
      `INSERT INTO cashier_closing_events (cashier_closing_id,event_type,actor_role,actor_id,expected_cash,actual_cash,variance,reason)
       VALUES (?,'reopened','admin',?,?,?,?,?)`,
      [id, req.user.id, closing.expected_cash, closing.actual_cash, closing.variance, reason]
    )
    await writeAuditLog({userId:req.user.id,userRole:'admin',action:'cashier.shift_reopened',entityType:'cashier_closing',entityId:id,oldValues:closing,newValues:{status:'reopened',reason},ipAddress:req.ip||null}, conn)
    await conn.commit()
  } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  broadcast(['admin','staff'], 'cashier_shift_reopened', { closingId:id })
  res.json({ message: 'Cashier shift reopened. The staff member may accept payments and close it again.' })
}


// ── Discount presets ──────────────────────────────────────────────────────────

const getDiscountPresetsAdmin = async (req,res) => {
  const [rows]=await db.query('SELECT * FROM discount_presets ORDER BY sort_order,label');res.json(rows)
}
const saveDiscountPresetAdmin = async (req,res) => {
  const id=Number(req.params.id)||0
  const discountType=['percentage','fixed'].includes(req.body.discount_type)?req.body.discount_type:'fixed'
  const value=Math.max(0,Number(req.body.value)||0)
  if(discountType==='percentage' && value>100) return res.status(400).json({code:'INVALID_DISCOUNT_PERCENTAGE',message:'Percentage discount cannot exceed 100%.'})
  const payload={label:String(req.body.label||'').trim(),discount_type:discountType,value,requires_reference:req.body.requires_reference?1:0,requires_admin_approval:req.body.requires_admin_approval?1:0,is_active:req.body.is_active===0||req.body.is_active===false?0:1,sort_order:Number(req.body.sort_order)||0}
  if(!payload.label)return res.status(400).json({message:'Discount label is required.'})
  if(id && !payload.is_active){
    const [[pending]]=await db.query(`SELECT COUNT(*) AS total FROM billing_adjustment_requests WHERE discount_preset_id=? AND status='pending'`,[id])
    if(Number(pending?.total||0)>0) return res.status(409).json({code:'PENDING_DISCOUNT_REQUESTS',message:`Resolve ${Number(pending.total)} pending billing request${Number(pending.total)===1?'':'s'} before deactivating this discount.`,pending_count:Number(pending.total)})
  }
  let targetId=id
  if(id){ await db.query(`UPDATE discount_presets SET label=?,discount_type=?,value=?,requires_reference=?,requires_admin_approval=?,is_active=?,sort_order=? WHERE id=?`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active,payload.sort_order,id]) }
  else { const [r]=await db.query(`INSERT INTO discount_presets (label,discount_type,value,requires_reference,requires_admin_approval,is_active,sort_order) VALUES (?,?,?,?,?,?,?)`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active,payload.sort_order]); targetId=r.insertId }
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:id?'billing.discount_preset_updated':'billing.discount_preset_created',entityType:'discount_preset',entityId:targetId,newValues:payload,ipAddress:req.ip||null})
  const [rows]=await db.query('SELECT * FROM discount_presets WHERE id=?',[targetId]);res.status(id?200:201).json(rows[0])
}

// ── System audit log ──────────────────────────────────────────────────────────
const getAuditLogs = async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)), offset=(page-1)*limit
  // MFA challenge/verification events stay in the database for security forensics,
  // but they are intentionally hidden from the normal Admin activity feed.
  const filters=["al.action NOT IN ('auth.mfa_challenge_sent','auth.mfa_verified')"],params=[]
  if(req.query.start_date){filters.push('DATE(al.created_at)>=?');params.push(String(req.query.start_date))}
  if(req.query.end_date){filters.push('DATE(al.created_at)<=?');params.push(String(req.query.end_date))}
  if(req.query.user_role){filters.push('al.user_role=?');params.push(String(req.query.user_role))}
  if(req.query.entity_type){filters.push('al.entity_type=?');params.push(String(req.query.entity_type))}
  if(req.query.area){
    const area=String(req.query.area)
    const areaTypes={
      appointments:['appointment'],
      doctor_schedule:['doctor_schedule','doctor_unavailable_date'],
      inventory:['inventory_item'],
      stock_transfers:['supply_request'],
      billing:['billing_record','billing_payment','billing_adjustment_request','cashier_closing','discount_preset','clinic_payment_settings'],
      service_catalog:['billing_service'],
      clinical:['consultation'],
      reports:['report'],
      clinic_settings:['clinic_settings'],
    }[area]
    if(area==='account_security'){filters.push("(al.action LIKE 'auth.%' OR al.action LIKE 'security.%' OR al.action LIKE 'account.%' OR al.action IN ('password_changed','first_password_change_completed'))")}
    else if(areaTypes?.length){filters.push(`al.entity_type IN (${areaTypes.map(()=>'?').join(',')})`);params.push(...areaTypes)}
  }
  if(req.query.action){filters.push('al.action LIKE ?');params.push(`%${String(req.query.action)}%`)}
  if(req.query.search){filters.push("(al.action LIKE ? OR al.entity_type LIKE ? OR al.entity_id LIKE ? OR COALESCE(a.full_name,s.full_name,d.full_name,p.full_name,'System') LIKE ? OR ap.full_name LIKE ? OR ad.full_name LIKE ? OR inv.name LIKE ? OR srp.full_name LIKE ? OR sri.name LIKE ?)");const q=`%${String(req.query.search)}%`;params.push(q,q,q,q,q,q,q,q,q)}
  const joins=`
    LEFT JOIN admins a ON al.user_role='admin' AND a.id=al.user_id
    LEFT JOIN staff s ON al.user_role='staff' AND s.id=al.user_id
    LEFT JOIN doctors d ON al.user_role='doctor' AND d.id=al.user_id
    LEFT JOIN patients p ON al.user_role='patient' AND p.id=al.user_id
    LEFT JOIN appointments apt ON al.entity_type='appointment' AND apt.id=CAST(al.entity_id AS UNSIGNED)
    LEFT JOIN patients ap ON ap.id=apt.patient_id
    LEFT JOIN doctors ad ON ad.id=apt.doctor_id
    LEFT JOIN inventory inv ON al.entity_type='inventory_item' AND inv.id=CAST(al.entity_id AS UNSIGNED)
    LEFT JOIN supply_requests sr ON al.entity_type='supply_request' AND sr.id=CAST(al.entity_id AS UNSIGNED)
    LEFT JOIN doctors srp ON srp.id=sr.doctor_id
    LEFT JOIN inventory sri ON sri.id=sr.inventory_id
    LEFT JOIN doctors schedule_doctor ON al.entity_type IN ('doctor_schedule','doctor_unavailable_date') AND schedule_doctor.id=CAST(SUBSTRING_INDEX(al.entity_id,':',1) AS UNSIGNED)
    LEFT JOIN billing_records abr ON al.entity_type='billing_record' AND abr.id=CAST(al.entity_id AS UNSIGNED)
    LEFT JOIN patients abp ON abp.id=abr.patient_id
    LEFT JOIN doctors abd ON abd.id=abr.doctor_id`
  const finalWhere=`WHERE ${filters.join(' AND ')}`
  const [[count]]=await db.query(`SELECT COUNT(DISTINCT al.id) AS total FROM audit_logs al ${joins} ${finalWhere}`,params)
  const [rows]=await db.query(`SELECT al.*,
      CASE al.user_role WHEN 'admin' THEN a.full_name WHEN 'staff' THEN s.full_name WHEN 'doctor' THEN d.full_name WHEN 'patient' THEN p.full_name ELSE 'System' END AS performed_by,
      ap.full_name AS appointment_patient_name, ad.full_name AS appointment_doctor_name, apt.appointment_date, apt.appointment_time,
      inv.name AS inventory_item_name,
      sri.name AS supply_item_name, srp.full_name AS supply_doctor_name, sr.qty_requested AS supply_quantity, sr.destination_location AS supply_destination, sr.reason AS supply_reason, sr.resolution_note AS supply_resolution_note,
      schedule_doctor.full_name AS schedule_doctor_name,
      abp.full_name AS billing_patient_name, abd.full_name AS billing_doctor_name
      FROM audit_logs al
      ${joins}
      ${finalWhere} ORDER BY al.created_at DESC,al.id DESC LIMIT ? OFFSET ?`,[...params,limit,offset])
  const total=Number(count?.total||0),totalPages=Math.max(1,Math.ceil(total/limit))
  res.json({items:rows,pagination:{page,limit,total,totalPages,hasPrev:page>1,hasNext:page<totalPages}})
}

module.exports = {
  login, verifyLoginMfa, checkAuth, logout,
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
  getPaymentSettingsAdmin, uploadPaymentQrImageAdmin, getPaymentQrUploadScanStatusAdmin, updatePaymentSettingsAdmin,
  getBillingReconciliation, getBillingAdjustmentRequestsAdmin, resolveBillingAdjustmentRequestAdmin, reopenCashierShiftAdmin, voidBillingPayment, refundBillingPayment,
  getClinicSettingsAdmin, updateClinicSettingsAdmin, getDiscountPresetsAdmin, saveDiscountPresetAdmin, getAuditLogs,
  getReports, recordReportExport, getInventoryLogs,
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock,
  getSupplyRequests, resolveSupplyRequest,
}



