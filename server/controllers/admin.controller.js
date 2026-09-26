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
const { requestAdminMfa, verifyAdminMfa, createSecurityCode, verifySecurityCode } = require('../utils/accountSecurity')
const { makeTemporaryPassword } = require('../utils/securityCrypto')
const { sendTempPassword, sendAppointmentStatusEmail, sendAccountSecurityOtp } = require('../utils/emailService')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const {
  receiveInventoryBatch,
  attachBatchesToInventory,
  syncInventorySnapshot,
  ensureInventoryLocationAllocations,
  syncLocationSnapshot,
} = require('../utils/inventoryBatches')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly, getCurrentTimeLabel, addDaysDateOnly } = require('../utils/date')
const { normalizePhilippinePhone } = require('../utils/phone')
const { validateBirthdate } = require('../utils/patientProfile')
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
const { setQueueState } = require('../utils/queueWorkflow')
const { writeAuditLog } = require('../utils/audit')
const { normalizeText, normalizeOptionalText, normalizeNumber, normalizePositiveId, assertPlainObject } = require('../utils/inputValidation')
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition, assertAppointmentMutationApplied } = require('../utils/appointmentSecurity')
const { saveDoctorScheduleDay } = require('../utils/doctorSchedule')
const { resolveSupplyTransfer } = require('../utils/supplyTransfers')
const { applyManualInventoryMovement } = require('../utils/manualInventoryMovement')
const { isValidQueueStatus } = require('../utils/workflowValidation')
const { DEFAULT_STAFF_PERMISSIONS, loadStaffPermissions, replaceStaffPermissions, normalizeStaffPermissions, samePermissionSet } = require('../utils/staffPermissions')
const {
  getActiveAppointmentConflict,
  getLastNoShowAppointment,
  makeNoShowWarningResponse,
} = require('../utils/appointmentPolicies')
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const DOCTOR_CLINIC_TYPES = new Set(['medical', 'derma'])
const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

const normalizeInventoryPayload = (body = {}) => {
  const category = ['medical','derma'].includes(String(body.category || '').trim()) ? String(body.category).trim() : 'medical'
  const itemType = ['medicine','supplies'].includes(String(body.item_type || '').trim()) ? String(body.item_type).trim() : 'supplies'
  const uom = String(body.uom || body.base_unit || body.unit || '').trim().toLowerCase()
  return {
    barcode: String(body.barcode || '').trim() || null,
    name: String(body.name || '').trim(),
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
    selling_price: body.selling_price === '' || body.selling_price === null || body.selling_price === undefined ? null : Math.max(0, Number(body.selling_price) || 0),
    supplier: String(body.supplier || '').trim() || null,
    supplier_id: Number(body.supplier_id) || null,
    expiration_date: body.expiration_date || null,
    batch_code: String(body.batch_code || '').trim() || null,
    batch_lot_code: String(body.batch_lot_code || '').trim().replace(/^-+/, '') || null,
    supplier_lot_number: String(body.supplier_lot_number || '').trim() || null,
    location_type_id: Number(body.location_type_id) || null,
    storage_location_id: Number(body.storage_location_id) || null,
    storage_location: String(body.storage_location || '').trim() || null,
  }
}


const validateInventoryRequiredFields = (body = {}, { requireOpeningQuantity = false } = {}) => {
  try {
    assertPlainObject(body)
    normalizeText(body.name, { field: 'Item Name', required: true, max: 150 })
    if (body.barcode !== undefined && body.barcode !== null && body.barcode !== '') normalizeText(body.barcode, { field: 'Product Barcode', max: 50 })
    if (body.supplier_lot_number !== undefined && body.supplier_lot_number !== null && body.supplier_lot_number !== '') normalizeText(body.supplier_lot_number, { field: 'Supplier Lot Number', max: 120 })
    normalizeNumber(body.threshold, { field: 'Low Stock Alert', required: true, min: 0, max: 9999999999 })
    normalizeNumber(body.selling_price, { field: 'Selling Price', required: true, min: 0.01, max: 99999999.99 })
    if (requireOpeningQuantity) normalizeNumber(body.stock, { field: 'Opening Quantity', required: true, min: 0, max: 9999999999 })
  } catch (err) {
    return { message: err.message, code: err.code || 'VALIDATION_ERROR', field: err.field || null }
  }
  const name = String(body.name || '').trim()
  const category = String(body.category || '').trim()
  const itemType = String(body.item_type || '').trim()
  const uom = String(body.uom || body.base_unit || body.unit || '').trim()
  const locationTypeId = Number(body.location_type_id)
  const supplierId = Number(body.supplier_id) || null
  const thresholdRaw = body.threshold
  const sellingPrice = Number(body.selling_price)

  if (!name) return { message: 'Item Name is required.', code: 'INVENTORY_NAME_REQUIRED' }
  if (!['medical', 'derma'].includes(category)) return { message: 'Select a valid Category.', code: 'INVENTORY_CATEGORY_REQUIRED' }
  if (!['medicine', 'supplies'].includes(itemType)) return { message: 'Select a valid Type.', code: 'INVENTORY_TYPE_REQUIRED' }
  if (!uom) return { message: 'Unit of Measure is required.', code: 'INVENTORY_UOM_REQUIRED' }
  if (!locationTypeId) return { message: 'Location Type is required.', code: 'INVENTORY_LOCATION_TYPE_REQUIRED' }
  if (thresholdRaw === '' || thresholdRaw === null || thresholdRaw === undefined || !Number.isFinite(Number(thresholdRaw)) || Number(thresholdRaw) < 0) {
    return { message: 'Low Stock Alert is required and must be 0 or greater.', code: 'INVENTORY_THRESHOLD_REQUIRED' }
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return { message: 'Selling Price is required and must be greater than ₱0.00.', code: 'INVENTORY_SELLING_PRICE_REQUIRED' }
  }

  if (requireOpeningQuantity) {
    if (body.stock === '' || body.stock === null || body.stock === undefined || !Number.isFinite(Number(body.stock)) || Number(body.stock) < 0) {
      return { message: 'Opening Quantity is required and must be 0 or greater.', code: 'INVENTORY_OPENING_QUANTITY_REQUIRED' }
    }
    if (Number(body.stock) > 0) {
      if (!supplierId) {
        return { message: 'Select the supplier for the opening receipt.', code: 'INVENTORY_SUPPLIER_REQUIRED' }
      }
      const noExpiry = body.no_expiry === true || body.no_expiry === 1 || String(body.no_expiry || '').toLowerCase() === 'true'
      if (itemType === 'medicine' && !String(body.expiration_date || '').trim()) {
        return { message: 'Batch Expiry is required for medicines.', code: 'INVENTORY_EXPIRY_REQUIRED' }
      }
      if (itemType === 'supplies' && !noExpiry && !String(body.expiration_date || '').trim()) {
        return { message: 'Enter the Batch Expiry or select “No expiry / Not applicable”.', code: 'INVENTORY_EXPIRY_REQUIRED' }
      }
      const lotMissing = body.supplier_lot_missing === true || body.supplier_lot_missing === 1 || String(body.supplier_lot_missing || '').toLowerCase() === 'true'
      if (!lotMissing && !String(body.supplier_lot_number || '').trim()) {
        return { message: 'Supplier Lot Number is required unless the supplier did not provide one.', code: 'INVENTORY_SUPPLIER_LOT_REQUIRED' }
      }
    }
  }

  return null
}

const resolveInventorySetupSelection = async ({ uom, location_type_id }, executor = db) => {
  if (!String(uom || '').trim()) {
    const error = new Error('Select a Unit of Measure configured in System Setup.')
    error.statusCode = 400
    error.code = 'INVENTORY_UOM_REQUIRED'
    throw error
  }
  const [[uomRow]] = await executor.query(
    'SELECT id,name FROM inventory_uoms WHERE LOWER(name)=? AND is_active=1 LIMIT 1',
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

const normalizeBillingCatalogPayload = (body = {}) => ({
  category_id: Number(body.category_id) || null,
  category: String(body.category || '').trim(),
  service_name: String(body.service_name || '').trim(),
  clinic_type: ['all', 'medical', 'derma'].includes(body.clinic_type) ? body.clinic_type : 'all',
  default_price: Math.max(0, Number(body.default_price ?? body.patient_price) || 0),
  consultation_fee: 0,
  profit_percentage: 0,
  is_active: body.is_active === 0 ? 0 : 1,
  sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  pricing_notes: String(body.pricing_notes || '').trim() || null,
  materials: normalizeServiceMaterials(body.materials),
})

const resolveBillingServiceCategory = async (payload, executor = db, { allowInactiveId = null } = {}) => {
  if (!['medical', 'derma'].includes(payload.clinic_type)) {
    const error = new Error('Select a valid clinic before choosing a service category.')
    error.statusCode = 400
    throw error
  }

  let rows = []
  if (payload.category_id) {
    ;[rows] = await executor.query(
      `SELECT id,name,clinic_type,is_active,sort_order
       FROM billing_service_categories
       WHERE id=? AND clinic_type=? LIMIT 1`,
      [payload.category_id, payload.clinic_type]
    )
  } else if (payload.category) {
    ;[rows] = await executor.query(
      `SELECT id,name,clinic_type,is_active,sort_order
       FROM billing_service_categories
       WHERE name=? AND clinic_type=? LIMIT 1`,
      [payload.category, payload.clinic_type]
    )
  }

  const category = rows[0]
  if (!category) {
    const error = new Error('Select a valid service category from System Setup.')
    error.statusCode = 400
    error.code = 'SERVICE_CATEGORY_REQUIRED'
    throw error
  }
  if (Number(category.is_active) !== 1 && Number(category.id) !== Number(allowInactiveId || 0)) {
    const error = new Error('That service category is inactive. Choose an active category in System Setup.')
    error.statusCode = 409
    error.code = 'SERVICE_CATEGORY_INACTIVE'
    throw error
  }
  return category
}

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
    `SELECT i.*, lt.name AS location_type_name, lt.code AS location_type_code,
            COALESCE(u.allow_decimal_quantity,0) AS uom_allow_decimal
     FROM (
       SELECT *
       FROM inventory
       ${whereClause}
     ) i
     LEFT JOIN inventory_location_types lt ON lt.id = i.location_type_id
     LEFT JOIN inventory_uoms u ON LOWER(u.name)=LOWER(COALESCE(i.uom,i.base_unit,i.unit,''))
     ORDER BY
       CASE WHEN i.expiration_date IS NULL THEN 1 ELSE 0 END,
       i.expiration_date ASC,
       i.category ASC,
       i.name ASC`,
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
    await writeAuditLog({ userRole: req.user?.role || 'admin', action: 'auth.login_failed', entityType: 'admin', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  const admin = rows[0]
  const match = await bcrypt.compare(password, admin.password)
  if (!match) {
    await writeAuditLog({ userId: admin.id, userRole: req.user?.role || 'admin', action: 'auth.login_failed', entityType: 'admin', entityId: admin.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  if (String(process.env.ADMIN_MFA_ENABLED || 'true').toLowerCase() !== 'false') {
    await requestAdminMfa(admin)
    await writeAuditLog({ userId: admin.id, userRole: req.user?.role || 'admin', action: 'auth.mfa_challenge_sent', entityType: 'admin', entityId: admin.id, ipAddress: req.ip || null }).catch(() => {})
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
  await writeAuditLog({ userId: admin.id, userRole: req.user?.role || 'admin', action: 'auth.login_success', entityType: 'admin', entityId: admin.id, ipAddress: req.ip || null }).catch(() => {})
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
    await writeAuditLog({ userId: decoded.id, userRole: req.user?.role || 'admin', action: 'auth.mfa_verified', entityType: 'admin', entityId: decoded.id, ipAddress: req.ip || null }).catch(() => {})
    await writeAuditLog({ userId: decoded.id, userRole: req.user?.role || 'admin', action: 'auth.login_success', entityType: 'admin', entityId: decoded.id, ipAddress: req.ip || null }).catch(() => {})
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
  await writeAuditLog({ userId: req.user?.id || null, userRole: req.user?.role || 'admin', action: 'auth.logout', entityType: 'admin', entityId: req.user?.id || null, ipAddress: req.ip || null }).catch(() => {})
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
  const [[{ lowStockCount }]]    = await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE archived_at IS NULL AND stock <= threshold')
  const [[{ activeQueue }]]      = await db.query(
    "SELECT COUNT(*) AS activeQueue FROM queue WHERE queue_date = ? AND status IN ('waiting','called','in_consultation')", [today]
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
  if (sort === 'created_at') sql += ` ORDER BY a.created_at ${direction}, a.id ${direction}`
  else if (sort === 'updated_at') sql += ` ORDER BY a.updated_at ${direction}, a.id ${direction}`
  else sql += ` ORDER BY a.appointment_date ${direction}, STR_TO_DATE(a.appointment_time, '%h:%i %p') ${direction}, a.id ${direction}`
  const [rows] = await db.query(sql, params)
  res.json(rows)
}

const confirmAppointment = async (req, res) => {
  const { id } = req.params
  const [rows] = await db.query(
    `SELECT a.id, a.status, a.appointment_date, a.appointment_time, a.clinic_type,
            p.id AS patient_id, p.email AS patient_email, p.phone AS patient_phone, p.full_name AS patient_name,
            d.id AS doctor_id, d.full_name AS doctor_name
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
  const [updated] = await db.query("UPDATE appointments SET status = 'confirmed' WHERE id = ? AND status = ?", [id, rows[0].status])
  await assertAppointmentMutationApplied(updated, id)
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'appointment.confirmed',entityType:'appointment',entityId:id,oldValues:{status:rows[0].status},newValues:{status:'confirmed'},ipAddress:req.ip||null }).catch(() => {})
  await createNotification({
    target_role: 'patient',
    target_user_id: rows[0].patient_id,
    type: 'appointment_confirmed',
    title: 'Appointment confirmed',
    message: `Your appointment with ${rows[0].doctor_name} has been confirmed.`,
    reference_type: 'appointment',
    reference_id: id,
  })
  await createNotification({
    target_role: 'doctor',
    target_user_id: rows[0].doctor_id,
    type: 'appointment_confirmed',
    title: 'Confirmed appointment',
    message: `${rows[0].patient_name} has a confirmed appointment on ${rows[0].appointment_date} at ${rows[0].appointment_time}.`,
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
    patientId: rows[0].patient_id,
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
  broadcast(['admin', 'staff', `doctor_${rows[0].doctor_id}`, `patient_${rows[0].patient_id}`], 'appointment_updated', { appointmentId: Number(id), status: 'confirmed' })
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
  const [updated] = await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status = ?", [req.params.id, rows[0].status])
  await assertAppointmentMutationApplied(updated, req.params.id)
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'appointment.cancelled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'cancelled'},ipAddress:req.ip||null }).catch(() => {})
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
    patientId: rows[0].patient_id,
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
  const [updated] = await db.query("UPDATE appointments SET status = 'no_show' WHERE id = ? AND status = ?", [req.params.id, rows[0].status])
  await assertAppointmentMutationApplied(updated, req.params.id)
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'appointment.no_show',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'no_show'},ipAddress:req.ip||null }).catch(() => {})
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
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  if (!['pending', 'confirmed', 'rescheduled'].includes(rows[0].status)) {
    return res.status(400).json({ message: 'Only pending, confirmed, or rescheduled appointments can be rescheduled.' })
  }

  assertAppointmentTransition(rows[0].status, 'rescheduled')
  await withAppointmentSlotLock({ doctorId: rows[0].doctor_id, date: normalizedDate, time: appointment_time }, async () => {
    await validateAppointmentSlot({ doctorId: rows[0].doctor_id, clinicType: rows[0].clinic_type, date: normalizedDate, time: appointment_time, excludeAppointmentId: req.params.id })
    const [updated] = await db.query(
      "UPDATE appointments SET appointment_date=?, appointment_time=?, status='confirmed' WHERE id=? AND status=?",
      [normalizedDate, appointment_time, req.params.id, rows[0].status]
    )
    await assertAppointmentMutationApplied(updated, req.params.id)
  })
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'appointment.rescheduled',entityType:'appointment',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:'confirmed',appointment_date:normalizedDate,appointment_time},ipAddress:req.ip||null }).catch(() => {})
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
    patientId: rows[0].patient_id,
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
    userId: req.user.id, userRole: req.user?.role || 'admin', action: 'appointment.created', entityType: 'appointment', entityId: result.insertId,
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
  const requestedStatus = String(req.body.status || '').trim()
  const target = requestedStatus === 'in-progress' ? 'called' : requestedStatus
  if (!isValidQueueStatus(requestedStatus) && !['called','in_consultation'].includes(target)) {
    return res.status(400).json({ message: 'Invalid queue status.' })
  }
  try {
    const row = await setQueueState({
      queueId: req.params.id,
      nextStatus: target,
      actorRole: 'admin',
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
  const birthdateError = birthdate ? validateBirthdate(String(birthdate)) : null
  if (birthdateError) return res.status(400).json({ message: birthdateError })
  const normalizedBirthdate = birthdate ? String(birthdate).slice(0,10) : null
  const tempPassword = makeTempPassword()
  const hashedPassword = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    `INSERT INTO patients
     (full_name, birthdate, gender, sex, phone, email, password, is_walk_in, consent_given, consent_given_at, consent_method, receive_promotions, is_profile_complete)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), ?, 0, 0)`,
    [name, normalizedBirthdate, normalizedSex, normalizedSex, normalizedPhone, normalizedEmail, hashedPassword, String(consent_method || 'signed_intake_form')]
  )
  await db.query('INSERT INTO patient_consents (patient_id, consent_type, ip_address) VALUES (?, ?, ?)', [result.insertId, 'data_processing', req.ip || null])
  await writeAuditLog({ userId: req.user.id, userRole: req.user?.role || 'admin', action: 'patient.walkin_registered', entityType: 'patient', entityId: result.insertId, newValues: { full_name: name, phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex, consent_method }, ipAddress: req.ip || null })
  res.status(201).json({ id: result.insertId, full_name: name, phone: normalizedPhone, email: normalizedEmail, birthdate: normalizedBirthdate, sex: normalizedSex })
}


// ── Staff ─────────────────────────────────────────────────────────────────────

const getStaff = async (req, res) => {
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff ORDER BY full_name')
  const [permissionRows] = await db.query(
    `SELECT staff_id, permission_key FROM staff_permissions
     WHERE granted = 1 ORDER BY staff_id, permission_key`
  ).catch(() => [[]])
  const byStaff = new Map()
  permissionRows.forEach((row) => {
    const list = byStaff.get(Number(row.staff_id)) || []
    list.push(row.permission_key)
    byStaff.set(Number(row.staff_id), list)
  })
  res.json(rows.map((row) => ({ ...row, permissions: byStaff.get(Number(row.id)) || [] })))
}

const createStaff = async (req, res) => {
  const { full_name, email, phone } = req.body
  let permissions
  try {
    const hasPermissionPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'permissions')
    permissions = normalizeStaffPermissions(hasPermissionPayload ? req.body.permissions : DEFAULT_STAFF_PERMISSIONS, { requireOne: true })
  } catch (error) { return res.status(error.statusCode || 400).json({ message: error.message, code: error.code }) }
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  const [existing] = await db.query('SELECT id FROM staff WHERE email = ?', [String(email).trim()])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })
  const tempPassword = makeTempPassword()
  const hashed = await bcrypt.hash(tempPassword, 10)
  const conn = await db.getConnection()
  let staffId
  try {
    await conn.beginTransaction()
    const [result] = await conn.query(
      'INSERT INTO staff (full_name, email, phone, password, role, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [String(full_name).trim(), String(email).trim(), normalizedPhone, hashed, 'staff', 'active']
    )
    staffId = result.insertId
    await replaceStaffPermissions(staffId, permissions, conn)
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',action:'account.staff_created',entityType:'staff',entityId:staffId,
      newValues:{full_name:String(full_name).trim(),email:String(email).trim(),phone:normalizedPhone,status:'active',must_change_password:true,permissions},
      ipAddress:req.ip||null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally { conn.release() }

  try {
    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/staff/login`
    await sendTempPassword(String(email).trim(), String(full_name).trim(), 'Staff', tempPassword, loginUrl)
  } catch (err) {
    console.error('⚠️ Staff email failed:', err.message)
  }
  const [[row]] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?', [staffId])
  res.status(201).json({ ...row, permissions })
}

const toggleStaff = async (req, res) => {
  const [rows] = await db.query('SELECT status FROM staff WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Not found.' })
  const newStatus = rows[0].status === 'active' ? 'inactive' : 'active'
  await db.query('UPDATE staff SET status = ?, session_version = COALESCE(session_version,1) + 1 WHERE id = ?', [newStatus, req.params.id])
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:`account.staff_${newStatus === 'active' ? 'enabled' : 'disabled'}`,entityType:'staff',entityId:req.params.id,oldValues:{status:rows[0].status},newValues:{status:newStatus,sessions_revoked:true},ipAddress:req.ip||null }).catch(() => {})
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
  const [existing] = await db.query('SELECT id FROM staff WHERE email = ? AND id <> ?', [String(email).trim(), req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another staff account.' })

  let nextPermissions = null
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'permissions')) {
    try { nextPermissions = normalizeStaffPermissions(req.body.permissions, { requireOne: true }) }
    catch (error) { return res.status(error.statusCode || 400).json({ message: error.message, code: error.code }) }
  }

  const currentPermissions = await loadStaffPermissions(req.params.id)
  const permissionChanged = nextPermissions ? !samePermissionSet(currentPermissions, nextPermissions) : false
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      `UPDATE staff SET full_name = ?, email = ?, phone = ?,
       session_version = session_version + ? WHERE id = ?`,
      [String(full_name).trim(), String(email).trim(), normalizedPhone, permissionChanged ? 1 : 0, req.params.id]
    )
    if (nextPermissions) await replaceStaffPermissions(req.params.id, nextPermissions, conn)
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',action:'account.staff_updated',entityType:'staff',entityId:req.params.id,
      oldValues: permissionChanged ? { permissions: currentPermissions } : null,
      newValues:{full_name:String(full_name).trim(),email:String(email).trim(),phone:normalizedPhone,permissions:nextPermissions || currentPermissions,sessions_revoked:permissionChanged},
      ipAddress:req.ip||null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally { conn.release() }

  const [updated] = await db.query('SELECT id, full_name, email, phone, role, status, created_at FROM staff WHERE id = ?', [req.params.id])
  res.json({ ...updated[0], permissions: nextPermissions || currentPermissions })
}

// ── Doctors ───────────────────────────────────────────────────────────────────

const getDoctors = async (req, res) => {
  const [rows] = await db.query(
    // FIX 3: return prc_license (requires migration_add_prc_license.sql)
    `SELECT id, full_name AS name, full_name, email, phone, specialty, clinic_type, clinic_type AS type, prc_license, is_active, created_at
     FROM doctors ORDER BY full_name`
  )
  res.json(rows)
}

const createDoctor = async (req, res) => {
  const { full_name, email, phone, specialty, clinic_type, prc_license } = req.body
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  if (!DOCTOR_CLINIC_TYPES.has(String(clinic_type || '')))
    return res.status(400).json({ message: 'Clinic assignment must be General Medicine or Dermatology.' })
  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ?', [email])
  if (existing.length > 0)
    return res.status(409).json({ message: 'Email already exists.' })
  const tempPassword = makeTempPassword()
  const hashed = await bcrypt.hash(tempPassword, 10)
  const [result] = await db.query(
    // FIX 3: save prc_license (requires migration_add_prc_license.sql)
    'INSERT INTO doctors (full_name, email, phone, specialty, clinic_type, prc_license, password, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [full_name, email, normalizedPhone, specialty?.trim() || null, clinic_type, prc_license || null, hashed]
  )
  const [rows] = await db.query(
    'SELECT id, full_name, email, phone, specialty, clinic_type, clinic_type AS type, prc_license, is_active, created_at FROM doctors WHERE id = ?', [result.insertId]
  )
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'account.doctor_created',entityType:'doctor',entityId:result.insertId,newValues:{full_name,email,phone:normalizedPhone,specialty,clinic_type,prc_license,is_active:true,must_change_password:true},ipAddress:req.ip||null }).catch(() => {})
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
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:`account.doctor_${newVal ? 'enabled' : 'disabled'}`,entityType:'doctor',entityId:req.params.id,oldValues:{is_active:rows[0].is_active},newValues:{is_active:newVal,sessions_revoked:true},ipAddress:req.ip||null }).catch(() => {})
  res.json({ is_active: newVal })
}

const updateDoctor = async (req, res) => {
  const { full_name, email, phone, specialty, clinic_type, prc_license } = req.body
  if (!full_name || !email || !phone)
    return res.status(400).json({ message: 'Name, email, and phone number are required.' })
  const normalizedPhone = normalizePhilippinePhone(phone)
  if (!normalizedPhone)
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  if (!DOCTOR_CLINIC_TYPES.has(String(clinic_type || '')))
    return res.status(400).json({ message: 'Clinic assignment must be General Medicine or Dermatology.' })

  const [rows] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id])
  if (rows.length === 0) return res.status(404).json({ message: 'Doctor account not found.' })

  const [existing] = await db.query('SELECT id FROM doctors WHERE email = ? AND id <> ?', [email, req.params.id])
  if (existing.length > 0)
    return res.status(409).json({ message: 'That email is already in use by another doctor account.' })

  await db.query(
    'UPDATE doctors SET full_name = ?, email = ?, phone = ?, specialty = ?, clinic_type = ?, prc_license = ? WHERE id = ?',
    [full_name.trim(), email.trim(), normalizedPhone, specialty?.trim() || null, clinic_type, prc_license?.trim() || null, req.params.id]
  )
  const [updated] = await db.query(
    'SELECT id, full_name, email, phone, specialty, clinic_type, clinic_type AS type, prc_license, is_active, created_at FROM doctors WHERE id = ?',
    [req.params.id]
  )
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'account.doctor_updated',entityType:'doctor',entityId:req.params.id,newValues:{full_name,email,phone:normalizedPhone,specialty,clinic_type,prc_license},ipAddress:req.ip||null }).catch(() => {})
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
  try {
    const result = await saveDoctorScheduleDay({
      doctorId: req.params.id,
      body: req.body,
      actorRole: 'admin',
      actorId: req.user.id,
      ipAddress: req.ip,
    })
    res.json(result)
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code || null,
        conflict_count: error.conflict_count || 0,
        conflicts: error.conflicts || [],
        doctor_name: error.doctor_name || null,
      })
    }
    throw error
  }
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

  const [[doctorRowsForUnavailable]] = await db.query('SELECT full_name FROM doctors WHERE id=? LIMIT 1',[doctorId])
  const [conflicts] = await db.query(
    `SELECT a.id, a.patient_id, a.status, a.appointment_time, a.clinic_type, p.full_name AS patient_name, p.email AS patient_email, p.phone AS patient_phone
     FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status IN ('pending','confirmed')
     ORDER BY STR_TO_DATE(a.appointment_time, '%h:%i %p') ASC`,
    [doctorId, unavailableDate]
  )
  if (conflicts.length > 0 && !req.body?.cancel_conflicts) {
    return res.status(409).json({
      code: 'ACTIVE_APPOINTMENTS_ON_UNAVAILABLE_DATE',
      message: 'This date has pending or confirmed appointments. Review them before blocking the date.',
      appointment_count: conflicts.length,
      doctor_name: doctorRowsForUnavailable?.full_name || null,
      appointments: conflicts,
    })
  }
  if (conflicts.length > 0 && req.body?.cancel_conflicts) {
    const cancellationMessage = String(req.body?.cancellation_message || '').trim()
    if (!cancellationMessage) {
      return res.status(400).json({ message: 'Cancellation message is required when cancelling appointments on a blocked date.' })
    }
    for (const appointment of conflicts) {
      await db.query("UPDATE appointments SET status='cancelled' WHERE id=?", [appointment.id])
      await createNotification({
        target_role: 'patient',
        target_user_id: appointment.patient_id,
        type: 'appointment_cancelled',
        title: 'Appointment cancelled',
        message: cancellationMessage,
        reference_type: 'appointment',
        reference_id: appointment.id,
      }).catch(() => {})
      await sendAppointmentStatusEmail({
        to: appointment.patient_email,
        patient_name: appointment.patient_name,
        doctor_name: doctorRowsForUnavailable?.full_name || 'your doctor',
        appointment_date: unavailableDate,
        appointment_time: appointment.appointment_time,
        clinic_type: appointment.clinic_type || 'medical',
        status: 'cancelled',
        notes: cancellationMessage,
      }).catch(() => {})
      await sendPatientAppointmentStatusSms({
        patientId: appointment.patient_id,
        patientPhone: appointment.patient_phone,
        patientName: appointment.patient_name,
        doctorName: doctorRowsForUnavailable?.full_name || 'your doctor',
        appointmentDate: unavailableDate,
        appointmentTime: appointment.appointment_time,
        status: 'cancelled',
        notes: cancellationMessage,
      }).catch(() => {})
      broadcast(['admin','staff',`patient_${appointment.patient_id}`], 'appointment_updated', { appointmentId: Number(appointment.id), status: 'cancelled' })
    }
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
    userId: req.user.id, userRole: req.user?.role || 'admin', action: 'schedule.unavailable_date_saved', entityType: 'doctor_unavailable_date', entityId: `${doctorId}:${unavailableDate}`,
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
    userId: req.user.id, userRole: req.user?.role || 'admin', action: 'schedule.unavailable_date_removed', entityType: 'doctor_unavailable_date', entityId: `${req.params.id}:${unavailableDate}`,
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
  if (!payload.service_name) {
    return res.status(400).json({ message: 'Service name is required.' })
  }
  if (payload.default_price <= 0) return res.status(400).json({ code:'SERVICE_PRICE_REQUIRED', message:'Service Price is required and must be greater than ₱0.00.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const category = await resolveBillingServiceCategory(payload, conn)
    payload.category_id = category.id
    payload.category = category.name

    const [result] = await conn.query(
      `INSERT INTO billing_service_catalog
       (category_id, category, service_name, clinic_type, default_price, consultation_fee, profit_percentage, is_active, sort_order, pricing_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.category_id,
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
    await writeAuditLog({ userId: req.user.id, userRole: req.user?.role || 'admin', action: 'catalog.service_created', entityType: 'billing_service', entityId: result.insertId, newValues: payload, ipAddress: req.ip || null }, conn)
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
  if (!payload.service_name) {
    return res.status(400).json({ message: 'Service name is required.' })
  }
  if (payload.default_price <= 0) return res.status(400).json({ code:'SERVICE_PRICE_REQUIRED', message:'Service Price is required and must be greater than ₱0.00.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [existingRows] = await conn.query(
      'SELECT id,category_id FROM billing_service_catalog WHERE id = ? LIMIT 1',
      [req.params.serviceId]
    )
    if (existingRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Billing service not found.' })
    }

    const category = await resolveBillingServiceCategory(payload, conn, { allowInactiveId: existingRows[0].category_id })
    payload.category_id = category.id
    payload.category = category.name

    await conn.query(
      `UPDATE billing_service_catalog
       SET category_id = ?, category = ?, service_name = ?, clinic_type = ?, default_price = ?, consultation_fee = ?, profit_percentage = ?, is_active = ?, sort_order = ?, pricing_notes = ?
       WHERE id = ?`,
      [
        payload.category_id,
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
    await writeAuditLog({ userId: req.user.id, userRole: req.user?.role || 'admin', action: 'catalog.service_updated', entityType: 'billing_service', entityId: req.params.serviceId, newValues: payload, ipAddress: req.ip || null }, conn)
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
    await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'billing.service_archived',entityType:'billing_service',entityId:req.params.serviceId,oldValues:{service_name:rows[0].service_name,is_active:1},newValues:{is_active:0,historical_usage:Number(usage.count)},ipAddress:req.ip||null }).catch(() => {})
    return res.json({ message: 'Service archived. Historical bills were preserved.', archived: true })
  }

  await db.query('DELETE FROM billing_service_catalog WHERE id = ?', [req.params.serviceId])
  await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'billing.service_deleted',entityType:'billing_service',entityId:req.params.serviceId,oldValues:rows[0],newValues:null,ipAddress:req.ip||null }).catch(() => {})
  res.json({ message: 'Service deleted.', archived: false })
}


const uploadPaymentQrImageAdmin = async (req, res) => {
  const actorRole = req.user?.role === 'staff' ? 'staff' : 'admin'
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
        role: actorRole,
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
    const signed = createPaymentQrUploadSignature({ actorRole, actorId: req.user.id, provider, scanMode })
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
        bypass_token: issueBypassAuthorizationToken({ role: actorRole, userId: req.user.id, contextType: 'payment_qr', contextId: provider, reason, fileHash }),
      })
    }
    return res.status(error.statusCode || 502).json({ message: error.message || 'QR image upload failed.' })
  }

  if (scanMode === 'bypass') {
    const securityToken = issueAcceptedUploadToken({
      role: actorRole, userId: req.user.id, contextType: 'payment_qr', contextId: provider,
      status: 'bypassed', assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id,
    })
    await writeAuditLog({
      userId: req.user.id,
      userRole: req.user?.role || 'admin',
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
      role: actorRole, userId: req.user.id, contextType: 'payment_qr', contextId: provider,
      assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id, fileHash,
    }),
  })
}

const getPaymentQrUploadScanStatusAdmin = async (req, res) => {
  const actorRole = req.user?.role === 'staff' ? 'staff' : 'admin'
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
      role: actorRole,
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
    bypass_token: issueBypassAuthorizationToken({ role: actorRole, userId: req.user.id, contextType: 'payment_qr', contextId: provider, reason, fileHash: pending.file_sha256 }),
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
          role: actorRole, userId: req.user.id, contextType: 'payment_qr', contextId: provider,
          status: 'approved', assetId, url: result.secure_url || pending.url, publicId: result.public_id || pending.public_id,
        }),
      })
    }
    if (result.status === 'rejected') {
      await writeAuditLog({
        userId: req.user.id,
        userRole: req.user?.role || 'admin',
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
  const actorRole = req.user?.role === 'staff' ? 'staff' : 'admin'
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
        role: actorRole,
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
       payload.gcash_qr_mode, payload.maya_qr_mode, payload.bank_name, payload.bank_account_name, payload.bank_account_number, req.user?.role === 'admin' ? req.user.id : null]
    )
    await writeAuditLog({
      userId: req.user.id,
      userRole: req.user?.role || 'admin',
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
    userRole: req.user?.role || 'admin',
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
    `SELECT d.full_name AS name, d.specialty, d.clinic_type, (d.clinic_type = 'derma') AS is_derma,
            COUNT(*) AS appointments, COUNT(DISTINCT a.patient_id) AS patients,
            SUM(a.status = 'completed') AS completed
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.appointment_date BETWEEN ? AND ?
     GROUP BY d.id, d.full_name, d.specialty, d.clinic_type
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
       (SELECT COUNT(*) FROM inventory WHERE archived_at IS NULL) AS total_items,
       0 AS total_value,
       (SELECT SUM(stock = 0) FROM inventory WHERE archived_at IS NULL) AS out_of_stock,
       (SELECT SUM(stock > 0 AND stock <= threshold) FROM inventory WHERE archived_at IS NULL) AS low_stock,
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date IS NOT NULL AND expiration_date < ?) AS expired,
       (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiration_date BETWEEN ? AND ?) AS expiring_soon`,
    [clinicToday, clinicToday, clinicNext30])

  const [stockActivity] = await db.query(
    `SELECT DATE_FORMAT(logged_at, '%Y-%m') AS ym,
            DATE_FORMAT(MIN(logged_at), '%b %Y') AS month,
            SUM(CASE WHEN type = 'in' AND COALESCE(movement_type,'') <> 'transfer_in' THEN 1 ELSE 0 END) AS stock_in_actions,
            SUM(CASE WHEN type = 'out' AND COALESCE(movement_type,'') <> 'transfer_out' THEN 1 ELSE 0 END) AS stock_out_actions,
            COALESCE(SUM(CASE WHEN type = 'in' AND COALESCE(movement_type,'') <> 'transfer_in' THEN qty ELSE 0 END), 0) AS stock_in,
            COALESCE(SUM(CASE WHEN type = 'out' AND COALESCE(movement_type,'') <> 'transfer_out' THEN qty ELSE 0 END), 0) AS stock_out
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY DATE_FORMAT(logged_at, '%Y-%m') ORDER BY ym ASC`, dateParams)

  const [stockMovementByReason] = await db.query(
    `SELECT COALESCE(movement_type, CASE WHEN type='in' THEN 'received' ELSE 'adjustment' END) AS movement_reason,
            COUNT(*) AS actions, COALESCE(SUM(qty),0) AS quantity
     FROM inventory_logs WHERE DATE(logged_at) BETWEEN ? AND ?
     GROUP BY COALESCE(movement_type, CASE WHEN type='in' THEN 'received' ELSE 'adjustment' END)
     ORDER BY quantity DESC`, dateParams)

  const [inventoryByCategory] = await db.query(
    `SELECT i.category, COUNT(DISTINCT i.id) AS items, COALESCE(SUM(b.quantity), 0) AS total_stock,
            0 AS total_value
     FROM inventory i
     LEFT JOIN inventory_batches b ON b.inventory_id=i.id AND b.archived_at IS NULL AND b.quantity > 0
     GROUP BY i.category ORDER BY total_value DESC, i.category ASC`)

  const [[currentOperations]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE appointment_date = ? AND status IN ('pending','confirmed','rescheduled','in-progress')) AS today_remaining,
       (SELECT COUNT(*) FROM appointments WHERE appointment_date > ? AND status IN ('pending','confirmed','rescheduled')) AS future_confirmed,
       (SELECT COUNT(*) FROM appointments WHERE status = 'pending' AND appointment_date >= ?) AS awaiting_approval,
       (SELECT COUNT(*) FROM queue WHERE queue_date = ? AND status IN ('waiting','called','in_consultation')) AS walkin_queue,
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
  const batchId = Number(req.query.batch_id) || 0
  const inventoryId = Number(req.query.inventory_id) || 0
  const kind = String(req.query.kind || 'all').trim().toLowerCase()

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

  if (batchId) { filters.push('il.batch_id = ?'); params.push(batchId) }
  if (inventoryId) { filters.push('il.inventory_id = ?'); params.push(inventoryId) }

  if (kind === 'all') filters.push("COALESCE(il.movement_type,'') <> 'transfer_in'")
  if (kind === 'stock_in') filters.push("il.type='in' AND COALESCE(il.movement_type,'') NOT IN ('transfer_in','correction_in')")
  if (kind === 'stock_out') filters.push("il.type='out' AND COALESCE(il.movement_type,'') NOT IN ('transfer_out','adjustment_out')")
  if (kind === 'transfers') filters.push("COALESCE(il.movement_type,'') = 'transfer_out'")
  if (kind === 'corrections') filters.push("COALESCE(il.movement_type,'') IN ('correction_in','adjustment_out')")

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM inventory_logs il
     ${whereClause}`,
    params
  )

  const [rows] = await db.query(
    `SELECT il.*, i.name AS item_name, ib.batch_code, ib.supplier_lot_number,
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
      batch_id: batchId || '',
      inventory_id: inventoryId || '',
    },
  })
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const normalizeSupplierClinics = (payload = {}) => {
  const source = Array.isArray(payload.clinics) ? payload.clinics : String(payload.category || '').split(',')
  const requested = new Set(source.map((value) => String(value || '').trim()).filter(Boolean))
  return ['medical','derma'].filter((clinic) => requested.has(clinic))
}

const supplierSupportsClinic = (categoryValue, clinic) => String(categoryValue || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .includes(clinic)

const nextInventoryBarcode = async (category, conn = db) => {
  const normalized = category === 'derma' ? 'derma' : 'medical'
  const prefix = normalized === 'derma' ? 'DRM' : 'GMED'
  await conn.query('INSERT IGNORE INTO inventory_barcode_sequences (category,last_number) VALUES (?,0)', [normalized])
  await conn.query('UPDATE inventory_barcode_sequences SET last_number = LAST_INSERT_ID(last_number + 1) WHERE category = ?', [normalized])
  const [[row]] = await conn.query('SELECT last_number FROM inventory_barcode_sequences WHERE category = ?', [normalized])
  const number = Number(row?.last_number || 1)
  return `${prefix}-${String(number).padStart(5, '0')}`
}

const getInventoryMasterData = async (req, res) => {
  const category = ['medical','derma'].includes(String(req.query.category || '')) ? String(req.query.category) : null
  const [uoms] = await db.query('SELECT id,name,allow_decimal_quantity,decimal_precision FROM inventory_uoms WHERE is_active=1 ORDER BY sort_order,name')
  const [suppliers] = await db.query(`SELECT id,name,contact_person,contact_number,address,category FROM inventory_suppliers WHERE is_active=1 ${category ? "AND FIND_IN_SET(?, REPLACE(category,' ','')) > 0" : ''} ORDER BY name ASC`, category ? [category] : [])
  const [locationTypes] = await db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types ORDER BY is_active DESC,sort_order,name')
  const [movementReasons] = await db.query(`SELECT id,name,code,movement_type,requires_batch,is_system
                                            FROM inventory_movement_reasons WHERE is_active=1
                                            ORDER BY FIELD(movement_type,'in','out'),is_system DESC,name ASC`)
  res.json({ uoms, suppliers, location_types: locationTypes, movement_reasons: movementReasons })
}

const createInventoryLocation = async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const type = ['stockroom','room','dispensing','storage'].includes(String(req.body?.location_type || '')) ? String(req.body.location_type) : 'storage'
  if (!name) return res.status(400).json({ message: 'Location name is required.' })
  try {
    const [result] = await db.query('INSERT INTO inventory_locations (name,location_type,is_active) VALUES (?,?,1)', [name,type])
    res.status(201).json({ id: result.insertId, name, location_type: type, is_active: 1 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That storage location already exists.' })
    throw err
  }
}

const createInventorySupplier = async (req, res) => {
  const name = normalizeText(req.body?.name, { field: 'Company / Supplier Name', required: true, max: 160 })
  const contactPerson = normalizeOptionalText(req.body?.contact_person, { field: 'Contact Person', max: 160 })
  const contactNumber = normalizeOptionalText(req.body?.contact_number, { field: 'Contact Number', max: 80 })
  const address = normalizeOptionalText(req.body?.address, { field: 'Address', max: 255, multiline: true })
  const clinics = normalizeSupplierClinics(req.body)
  const category = clinics.join(',')
  if (!name || !clinics.length) return res.status(400).json({ message: 'Company / Supplier Name and at least one clinic are required.' })

  const [sameNameRows] = await db.query(
    'SELECT id,name,contact_person,contact_number,address,category,is_active FROM inventory_suppliers WHERE name=? ORDER BY id ASC',
    [name]
  )
  const compatible = sameNameRows.find((row) => clinics.every((clinic) => supplierSupportsClinic(row.category, clinic)))
  if (compatible) return res.json(compatible)
  if (sameNameRows.length) {
    return res.status(409).json({ message: 'That supplier already exists but is not assigned to this clinic. Update its Clinic checkboxes in System Setup.' })
  }

  try {
    const [result] = await db.query(
      'INSERT INTO inventory_suppliers (name,contact_person,contact_number,address,category,is_active) VALUES (?,?,?,?,?,1)',
      [name,contactPerson,contactNumber,address,category]
    )
    res.status(201).json({ id: result.insertId, name, contact_person:contactPerson, contact_number:contactNumber, address, category, is_active: 1 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [[row]] = await db.query('SELECT id,name,contact_person,contact_number,address,category,is_active FROM inventory_suppliers WHERE category=? AND name=? LIMIT 1',[category,name])
      return res.json(row)
    }
    throw err
  }
}

const getInventory = async (req, res) => {
  const [ids] = await db.query('SELECT id FROM inventory WHERE archived_at IS NULL ORDER BY id')
  for (const row of ids) {
    await ensureInventoryLocationAllocations(row.id, db)
    await syncInventorySnapshot(row.id, db)
  }
  const rows = await loadInventoryRows(db, 'WHERE archived_at IS NULL')
  res.json(rows)
}

const addInventoryItem = async (req, res) => {
  const validationError = validateInventoryRequiredFields(req.body, { requireOpeningQuantity: true })
  if (validationError) return res.status(400).json(validationError)

  let {
    barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, unit_size, stock, threshold, price, selling_price, supplier, supplier_id,
    expiration_date, batch_code, batch_lot_code, supplier_lot_number, location_type_id,
  } = normalizeInventoryPayload(req.body)
  price = selling_price
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const setupSelection = await resolveInventorySetupSelection({ uom, location_type_id }, conn)
    uom = setupSelection.uom
    unit = uom
    base_unit = uom
    location_type_id = setupSelection.locationType.id
    if (!barcode) barcode = await nextInventoryBarcode(category, conn)
    // Every receipt gets its own internal batch code. Supplier lot is stored separately.
    batch_code = null
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
       (barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, unit_size, stock, threshold, price, selling_price, supplier, supplier_id, expiration_date, storage_location, location_type_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [barcode, name, category, item_type, uom, dosage_form, strength, unit, base_unit, unit_size, 0, threshold, price, selling_price, supplier, supplier_id, null, null, location_type_id]
    )
    let openingBatchId = null
    let openingLocation = 'Main Stockroom'
    if (stock > 0) {
      const received = await receiveInventoryBatch(result.insertId, {
        quantity: stock,
        expiration_date: req.body.no_expiry ? null : expiration_date,
        batch_code,
        supplier_lot_number,
        supplier_id,
        unit_cost: 0,
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
        `INSERT INTO inventory_logs (inventory_id, admin_id, type, qty, note, movement_type, batch_id, to_location)
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
      userRole: req.user?.role || 'admin',
      action: 'inventory.item_created',
      entityType: 'inventory_item',
      entityId: result.insertId,
      newValues: { name, category, item_type, barcode, uom, dosage_form, strength, selling_price, supplier_id, location_type_id, initial_quantity: Number(stock || 0), opening_batch_id: openingBatchId, opening_batch_code: batch_code || null, supplier_lot_number: supplier_lot_number || null, expiration_date: expiration_date || null },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
    const rows = await loadInventoryRows(db, 'WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
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

// FIX 5: Edit an existing inventory item
const updateInventoryItem = async (req, res) => {
  const validationError = validateInventoryRequiredFields(req.body)
  if (validationError) return res.status(400).json(validationError)

  let {
    barcode, name, category, item_type, uom, dosage_form, strength, threshold, selling_price, supplier, supplier_id, location_type_id,
  } = normalizeInventoryPayload(req.body)
  if (!name || !category)
    return res.status(400).json({ message: 'Name and category are required.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [currentRows] = await conn.query('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [req.params.id])
    if (currentRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Item not found.' })
    }
    if (currentRows[0].archived_at) {
      await conn.rollback()
      return res.status(409).json({ code: 'INVENTORY_ARCHIVED', message: 'Archived inventory items cannot be edited.' })
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
       SET barcode=?, name=?, category=?, item_type=?, uom=?, dosage_form=?, strength=?, unit=?, base_unit=?, unit_size=1, threshold=?, price=?, selling_price=?, supplier=?, supplier_id=?, location_type_id=?
       WHERE id=?`,
      [barcode, name, category, item_type, canonicalUom, dosage_form, strength, canonicalUom, canonicalUom, threshold, selling_price, selling_price, supplier, supplier_id, location_type_id, req.params.id]
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

// QA-001: Ordinary inventory removal is archive-only. Permanent deletion is not
// exposed through the operational endpoint, so inventory history cannot disappear.
const deleteInventoryItem = async (req, res) => {
  const inventoryId = Number(req.params.id)
  if (!inventoryId) return res.status(400).json({ message: 'Select a valid inventory item.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT id, name, stock, archived_at FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE', [inventoryId])
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ message: 'Item not found.' }) }
    const item = rows[0]
    if (item.archived_at) { await conn.rollback(); return res.status(409).json({ message: 'This inventory item is already archived.' }) }
    if (Number(item.stock || 0) > 0) {
      await conn.rollback()
      return res.status(409).json({
        code: 'INVENTORY_STOCK_REMAINS',
        message: 'This item still has stock. Stock out, dispense, or transfer the remaining quantity before archiving it.'
      })
    }

    const [[history]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM inventory_batches WHERE inventory_id=?) +
         (SELECT COUNT(*) FROM inventory_logs WHERE inventory_id=?) +
         (SELECT COUNT(*) FROM supply_requests WHERE inventory_id=?) +
         (SELECT COUNT(*) FROM inventory_transfers WHERE inventory_id=?) +
         (SELECT COUNT(*) FROM billing_items WHERE source_inventory_id=?) +
         (SELECT COUNT(*) FROM billing_service_materials WHERE inventory_id=?) +
         (SELECT COUNT(*) FROM consultation_inventory_usage WHERE inventory_id=?) AS history_count`,
      [inventoryId, inventoryId, inventoryId, inventoryId, inventoryId, inventoryId, inventoryId]
    )
    const historyCount = Number(history?.history_count || 0)
    const reason = normalizeOptionalText(req.body?.reason, { field: 'Archive Reason', max: 255 })
      || (historyCount > 0
        ? 'Archived because the item has historical inventory, billing, transfer, or clinical records.'
        : 'Archived from active inventory by an administrator.')

    const [archiveResult] = await conn.query(
      'UPDATE inventory SET archived_at=NOW(), archived_by_admin_id=?, archive_reason=? WHERE id=? AND archived_at IS NULL',
      [req.user.id, reason, inventoryId]
    )
    if (Number(archiveResult.affectedRows || 0) !== 1) {
      await conn.rollback()
      return res.status(409).json({ message: 'This inventory item changed while you were viewing it. Refresh and try again.' })
    }
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.item_archived',entityType:'inventory_item',entityId:inventoryId,
      oldValues:{ name:item.name, stock:Number(item.stock||0), archived_at:null },
      newValues:{ archived:true, archive_reason:reason, history_count:historyCount },ipAddress:req.ip||null,
    }, conn)
    await conn.commit()
    return res.json({ archived:true, message:'Inventory item archived. It is hidden from active inventory while historical records remain intact.' })
  } catch (error) {
    await conn.rollback()
    if (error?.statusCode) return res.status(error.statusCode).json({ message:error.message, code:error.code || null, field:error.field || null })
    throw error
  } finally {
    conn.release()
  }
}

const getInventoryBatchHistory = async (req, res) => {
  const batchId = Number(req.params.batchId)
  if (!batchId) return res.status(400).json({ message: 'Select a valid batch.' })

  const batch = await getInventoryBatchForAction(batchId).catch(() => null)
  if (!batch) return res.status(404).json({ message: 'Batch not found.' })

  const [movements] = await db.query(
    `SELECT il.*, i.name AS item_name, ib.batch_code, ib.supplier_lot_number,
            COALESCE(s.full_name, a.full_name, 'System') AS performed_by,
            CASE
              WHEN il.admin_id IS NOT NULL THEN 'Admin'
              WHEN il.staff_id IS NOT NULL THEN 'Staff'
              ELSE 'System'
            END AS performed_by_role
     FROM inventory_logs il
     LEFT JOIN inventory i ON i.id = il.inventory_id
     LEFT JOIN inventory_batches ib ON ib.id = il.batch_id
     LEFT JOIN staff s ON s.id = il.staff_id
     LEFT JOIN admins a ON a.id = il.admin_id
     WHERE il.batch_id = ?
     ORDER BY il.logged_at DESC, il.id DESC
     LIMIT 200`,
    [batchId]
  )

  const [auditRows] = await db.query(
    `SELECT al.id, al.action, al.old_values, al.new_values, al.created_at, al.user_role, al.user_id,
            COALESCE(a.full_name, 'System') AS performed_by
     FROM audit_logs al
     LEFT JOIN admins a ON al.user_role = 'admin' AND a.id = al.user_id
     WHERE al.entity_type = 'inventory_batch' AND al.entity_id = ?
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT 200`,
    [String(batchId)]
  )

  const parseJsonValue = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value
    try { return JSON.parse(value) } catch { return null }
  }

  res.json({
    batch: {
      id: batch.id, inventory_id: batch.inventory_id, item_name: batch.item_name, item_barcode: batch.item_barcode,
      batch_code: batch.batch_code, quantity: Number(batch.quantity || 0), expiration_date: batch.expiration_date || null,
      unit_cost: Number(batch.unit_cost || 0), note: batch.note || null, archived_at: batch.archived_at || null,
      archive_reason: batch.archive_reason || null,
    },
    movements,
    audit: auditRows.map((row) => ({ ...row, old_values: parseJsonValue(row.old_values), new_values: parseJsonValue(row.new_values) })),
  })
}

const INVENTORY_BATCH_ACTION_PURPOSE = 'inventory_batch_action'
const BILLING_PAYMENT_ACTION_PURPOSE = 'billing_payment_action'
const BILLING_PAYMENT_ACTIONS = new Set(['void', 'refund'])
const INVENTORY_BATCH_ACTIONS = new Set(['correct_quantity', 'correct_details', 'archive', 'restore', 'delete'])

const maskEmailAddress = (email = '') => {
  const [local = '', domain = ''] = String(email || '').split('@')
  if (!local || !domain) return 'your admin email'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}

const getInventoryBatchForAction = async (batchId, executor = db, forUpdate = false) => {
  const [rows] = await executor.query(
    `SELECT b.id, b.inventory_id, b.batch_code, b.supplier_lot_number, b.quantity, b.expiration_date, b.note,
            COALESCE(b.unit_cost,0) AS unit_cost, b.archived_at, b.archived_by_admin_id, b.archive_reason,
            i.name AS item_name, i.barcode AS item_barcode, COALESCE(i.uom,i.base_unit,i.unit,'') AS uom
     FROM inventory_batches b
     JOIN inventory i ON i.id = b.inventory_id
     WHERE b.id = ?
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [batchId]
  )
  return rows[0] || null
}

const getInventoryBatchReferenceCounts = async (batchId, executor = db) => {
  const [[row]] = await executor.query(
    `SELECT
       (SELECT COUNT(*) FROM inventory_logs WHERE batch_id = ?) AS inventory_logs,
       (SELECT COUNT(*) FROM consultation_inventory_usage_batches WHERE batch_id = ?) AS consultation_usage,
       (SELECT COUNT(*) FROM billing_item_batch_usage WHERE batch_id = ?) AS billing_usage,
       (SELECT COUNT(*) FROM inventory_transfer_batches WHERE batch_id = ?) AS transfer_usage`,
    [batchId, batchId, batchId, batchId]
  )
  return {
    inventory_logs: Number(row?.inventory_logs || 0),
    consultation_usage: Number(row?.consultation_usage || 0),
    billing_usage: Number(row?.billing_usage || 0),
    transfer_usage: Number(row?.transfer_usage || 0),
  }
}

const batchHasProtectedHistory = (counts = {}) => Object.values(counts).some((value) => Number(value || 0) > 0)

const normalizeInventoryBatchActionPayload = (action, body, batch) => {
  const reason = String(body?.reason || '').trim()
  if (reason.length < 5) {
    const error = new Error('Enter a correction/reason with at least 5 characters.')
    error.statusCode = 400
    throw error
  }

  if (['correct_quantity', 'correct_details'].includes(action) && batch.archived_at) {
    const error = new Error('Restore this archived batch before correcting it.')
    error.statusCode = 409
    error.code = 'BATCH_ARCHIVED'
    throw error
  }

  if (action === 'correct_quantity') {
    const targetQuantity = Number(body?.target_quantity)
    if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
      const error = new Error('Correct quantity must be zero or greater.')
      error.statusCode = 400
      throw error
    }
    if (Math.abs(targetQuantity - Number(batch.quantity || 0)) < 0.0001) {
      const error = new Error('The corrected quantity is the same as the current batch quantity.')
      error.statusCode = 400
      throw error
    }
    return { reason, target_quantity: targetQuantity }
  }

  if (action === 'correct_details') {
    let lotCode = String(body?.batch_lot_code || '').trim().replace(/^-+/, '')
    const prefix = String(batch.item_barcode || '').trim()
    if (prefix && lotCode.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)) lotCode = lotCode.slice(prefix.length + 1)
    if (!lotCode) {
      const error = new Error('Batch / Lot code is required.')
      error.statusCode = 400
      throw error
    }
    const fullBatchCode = prefix ? `${prefix}-${lotCode}` : lotCode
    if (fullBatchCode.length > 80) {
      const error = new Error('Batch / Lot code is too long.')
      error.statusCode = 400
      throw error
    }
    const rawExpiry = String(body?.expiration_date || '').trim()
    const expirationDate = rawExpiry || null
    if (expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      const error = new Error('Enter a valid batch expiry date.')
      error.statusCode = 400
      throw error
    }
    return {
      reason,
      batch_lot_code: lotCode,
      batch_code: fullBatchCode,
      supplier_lot_number: String(body?.supplier_lot_number || '').trim().slice(0, 120) || null,
      expiration_date: expirationDate,
      note: String(body?.note || '').trim().slice(0, 1000) || null,
    }
  }

  if (action === 'archive') {
    if (Number(batch.quantity || 0) > 0) {
      const error = new Error('Only a zero-stock batch can be archived. Stock out the remaining quantity first.')
      error.statusCode = 409
      error.code = 'BATCH_HAS_STOCK'
      throw error
    }
    if (batch.archived_at) {
      const error = new Error('This batch is already archived.')
      error.statusCode = 409
      throw error
    }
    return { reason }
  }

  if (action === 'restore') {
    if (!batch.archived_at) {
      const error = new Error('This batch is not archived.')
      error.statusCode = 409
      throw error
    }
    return { reason }
  }

  if (action === 'delete') {
    if (Number(batch.quantity || 0) > 0) {
      const error = new Error('A batch with remaining stock cannot be deleted.')
      error.statusCode = 409
      error.code = 'BATCH_HAS_STOCK'
      throw error
    }
    return { reason }
  }

  const error = new Error('Unsupported batch action.')
  error.statusCode = 400
  throw error
}

const requestInventoryBatchActionCode = async (req, res) => {
  const batchId = Number(req.params.batchId)
  const action = String(req.body?.action || '').trim()
  if (!batchId || !INVENTORY_BATCH_ACTIONS.has(action)) return res.status(400).json({ message: 'Select a valid batch action.' })

  const batch = await getInventoryBatchForAction(batchId)
  if (!batch) return res.status(404).json({ message: 'Batch not found.' })

  let payload
  try { payload = normalizeInventoryBatchActionPayload(action, req.body, batch) }
  catch (error) { return res.status(error.statusCode || 400).json({ message: error.message, code: error.code || null }) }

  if (action === 'delete') {
    const references = await getInventoryBatchReferenceCounts(batchId)
    if (batchHasProtectedHistory(references)) {
      return res.status(409).json({
        message: 'This zero-stock batch has inventory/clinical/billing/transfer history and cannot be hard deleted. Archive it instead.',
        code: 'BATCH_HAS_HISTORY',
        references,
      })
    }
  }

  const [[admin]] = await db.query('SELECT id,full_name,email,password FROM admins WHERE id=? LIMIT 1', [req.user.id])
  if (!admin) return res.status(404).json({ message: 'Administrator account not found.' })
  if (!String(req.body?.password || '')) return res.status(400).json({ message: 'Admin password is required.' })
  const passwordMatches = await bcrypt.compare(String(req.body.password), admin.password)
  if (!passwordMatches) return res.status(401).json({ message: 'Admin password is incorrect.' })
  if (!admin.email) return res.status(400).json({ message: 'The administrator account needs an email address for verification.' })

  const authorizationPayload = {
    action,
    batch_id: batch.id,
    inventory_id: batch.inventory_id,
    old: {
      quantity: Number(batch.quantity || 0),
      batch_code: batch.batch_code || null,
      supplier_lot_number: batch.supplier_lot_number || null,
      expiration_date: batch.expiration_date ? String(batch.expiration_date).slice(0, 10) : null,
      unit_cost: Number(batch.unit_cost || 0),
      note: batch.note || null,
      archived_at: batch.archived_at || null,
    },
    requested: payload,
  }

  try {
    const code = await createSecurityCode({
      role: 'admin', accountId: req.user.id, purpose: INVENTORY_BATCH_ACTION_PURPOSE, payload: authorizationPayload,
    })
    await sendAccountSecurityOtp(admin.email, admin.full_name, code)
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_action_verification_requested',entityType:'inventory_batch',entityId:batch.id,
      newValues:{ action, item_name:batch.item_name, batch_code:batch.batch_code || null, reason:payload.reason },ipAddress:req.ip||null,
    }).catch(() => {})
    res.json({ message: `Verification code sent to ${maskEmailAddress(admin.email)}.`, destination: maskEmailAddress(admin.email) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not send the verification code.' })
  }
}

const confirmInventoryBatchAction = async (req, res) => {
  const routeBatchId = Number(req.params.batchId)
  const code = String(req.body?.code || '').trim()
  if (!routeBatchId || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter the 6-digit verification code.' })

  let verified
  try {
    verified = await verifySecurityCode({ role:'admin', accountId:req.user.id, purpose:INVENTORY_BATCH_ACTION_PURPOSE, code })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid or expired verification code.' })
  }

  const authorization = verified.payload || {}
  const action = String(authorization.action || '')
  const batchId = Number(authorization.batch_id)
  if (!INVENTORY_BATCH_ACTIONS.has(action) || batchId !== routeBatchId) {
    return res.status(400).json({ message: 'This verification code does not authorize the selected batch action.' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const batch = await getInventoryBatchForAction(batchId, conn, true)
    if (!batch) throw Object.assign(new Error('Batch not found.'), { statusCode:404 })

    const expected = authorization.old || {}
    const currentExpiry = batch.expiration_date ? String(batch.expiration_date).slice(0,10) : null
    if (
      Math.abs(Number(expected.quantity || 0) - Number(batch.quantity || 0)) > 0.0001 ||
      String(expected.batch_code || '') !== String(batch.batch_code || '') ||
      String(expected.supplier_lot_number || '') !== String(batch.supplier_lot_number || '') ||
      String(expected.expiration_date || '') !== String(currentExpiry || '') ||
      Math.abs(Number(expected.unit_cost || 0) - Number(batch.unit_cost || 0)) > 0.0001 ||
      String(expected.note || '') !== String(batch.note || '') ||
      String(expected.archived_at || '') !== String(batch.archived_at || '')
    ) {
      throw Object.assign(new Error('This batch changed after the verification code was requested. Review the latest values and request a new code.'), { statusCode:409, code:'BATCH_CHANGED' })
    }

    const requested = authorization.requested || {}
    const reason = String(requested.reason || '').trim()

    if (action === 'correct_quantity') {
      if (batch.archived_at) throw Object.assign(new Error('Restore this archived batch before correcting it.'), { statusCode:409 })
      const target = Number(requested.target_quantity)
      if (!Number.isFinite(target) || target < 0) throw Object.assign(new Error('Correct quantity is invalid.'), { statusCode:400 })
      const current = Number(batch.quantity || 0)
      const delta = target - current
      if (Math.abs(delta) < 0.0001) throw Object.assign(new Error('The batch quantity is already correct.'), { statusCode:400 })

      const [allocationRows] = await conn.query(
        `SELECT ilb.location_id, ilb.quantity, il.name
         FROM inventory_location_batches ilb
         JOIN inventory_locations il ON il.id=ilb.location_id
         WHERE ilb.batch_id=?
         ORDER BY ilb.quantity DESC, ilb.location_id
         FOR UPDATE`, [batch.id]
      )
      const allocated = allocationRows.reduce((sum,row)=>sum+Number(row.quantity||0),0)
      if (current > 0 && Math.abs(allocated-current) > 0.0001) {
        throw Object.assign(new Error('Batch location balances do not match the batch total. Repair the inventory allocation before applying a correction.'), { statusCode:409, code:'BATCH_LOCATION_MISMATCH' })
      }

      if (delta > 0) {
        let targetLocation = allocationRows[0] || null
        if (!targetLocation) {
          let [[location]] = await conn.query("SELECT id,name FROM inventory_locations WHERE COALESCE(is_active,1)=1 ORDER BY (name='Main Stockroom') DESC,id ASC LIMIT 1")
          if (!location) {
            await conn.query("INSERT INTO inventory_locations (name,location_type,is_active) VALUES ('Main Stockroom','stockroom',1)")
            ;[[location]] = await conn.query("SELECT id,name FROM inventory_locations WHERE name='Main Stockroom' LIMIT 1")
          }
          targetLocation = { location_id:location.id, name:location.name, quantity:0 }
        }
        await conn.query(
          `INSERT INTO inventory_location_batches (location_id,inventory_id,batch_id,quantity)
           VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`,
          [targetLocation.location_id,batch.inventory_id,batch.id,delta]
        )
        await conn.query(
          `INSERT INTO inventory_logs (inventory_id,admin_id,type,qty,note,movement_type,batch_id,to_location)
           VALUES (?,?,'in',?,?, 'correction_in',?,?)`,
          [batch.inventory_id,req.user.id,delta,reason,batch.id,targetLocation.name || null]
        )
      } else {
        let remaining = Math.abs(delta)
        for (const allocation of allocationRows) {
          if (remaining <= 0.0001) break
          const available = Number(allocation.quantity || 0)
          if (available <= 0) continue
          const take = Math.min(available, remaining)
          await conn.query('UPDATE inventory_location_batches SET quantity=quantity-? WHERE location_id=? AND batch_id=? AND quantity>=?', [take,allocation.location_id,batch.id,take])
          await conn.query(
            `INSERT INTO inventory_logs (inventory_id,admin_id,type,qty,note,movement_type,batch_id,from_location)
             VALUES (?,?,'out',?,?, 'adjustment_out',?,?)`,
            [batch.inventory_id,req.user.id,take,reason,batch.id,allocation.name || null]
          )
          remaining -= take
        }
        if (remaining > 0.0001) throw Object.assign(new Error('The batch location balances are insufficient for this correction.'), { statusCode:409 })
      }

      await conn.query('UPDATE inventory_batches SET quantity=? WHERE id=?', [target,batch.id])
      await syncInventorySnapshot(batch.inventory_id, conn)
      await syncLocationSnapshot(batch.inventory_id, conn)
      await writeAuditLog({
        userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_quantity_corrected',entityType:'inventory_batch',entityId:batch.id,
        oldValues:{ item_name:batch.item_name,batch_code:batch.batch_code,quantity:current },
        newValues:{ item_name:batch.item_name,batch_code:batch.batch_code,quantity:target,adjustment:delta,reason,authorization:'admin_password_email_code' },
        ipAddress:req.ip||null,
      },conn)
    } else if (action === 'correct_details') {
      if (batch.archived_at) throw Object.assign(new Error('Restore this archived batch before correcting it.'), { statusCode:409 })
      const newCode = String(requested.batch_code || '').trim()
      if (!newCode) throw Object.assign(new Error('Batch / Lot code is required.'), { statusCode:400 })
      const [[duplicate]] = await conn.query('SELECT id FROM inventory_batches WHERE inventory_id=? AND batch_code=? AND id<>? LIMIT 1', [batch.inventory_id,newCode,batch.id])
      if (duplicate) throw Object.assign(new Error('That Batch / Lot code already exists for this item.'), { statusCode:409, code:'BATCH_ALREADY_EXISTS' })
      await conn.query(
        'UPDATE inventory_batches SET batch_code=?,supplier_lot_number=?,expiration_date=?,note=? WHERE id=?',
        [newCode,requested.supplier_lot_number || null,requested.expiration_date || null,requested.note || null,batch.id]
      )
      await writeAuditLog({
        userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_details_corrected',entityType:'inventory_batch',entityId:batch.id,
        oldValues:{ item_name:batch.item_name,batch_code:batch.batch_code,supplier_lot_number:batch.supplier_lot_number||null,expiration_date:currentExpiry,note:batch.note||null },
        newValues:{ item_name:batch.item_name,batch_code:newCode,supplier_lot_number:requested.supplier_lot_number||null,expiration_date:requested.expiration_date||null,note:requested.note||null,reason,authorization:'admin_password_email_code' },
        ipAddress:req.ip||null,
      },conn)
    } else if (action === 'archive') {
      if (Number(batch.quantity||0)>0) throw Object.assign(new Error('Only a zero-stock batch can be archived.'), { statusCode:409 })
      if (batch.archived_at) throw Object.assign(new Error('This batch is already archived.'), { statusCode:409 })
      await conn.query('UPDATE inventory_batches SET archived_at=NOW(),archived_by_admin_id=?,archive_reason=? WHERE id=?', [req.user.id,reason,batch.id])
      await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_archived',entityType:'inventory_batch',entityId:batch.id,oldValues:{batch_code:batch.batch_code,archived_at:null},newValues:{batch_code:batch.batch_code,archived_at:'now',reason,authorization:'admin_password_email_code'},ipAddress:req.ip||null},conn)
    } else if (action === 'restore') {
      if (!batch.archived_at) throw Object.assign(new Error('This batch is not archived.'), { statusCode:409 })
      await conn.query('UPDATE inventory_batches SET archived_at=NULL,archived_by_admin_id=NULL,archive_reason=NULL WHERE id=?', [batch.id])
      await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_restored',entityType:'inventory_batch',entityId:batch.id,oldValues:{batch_code:batch.batch_code,archived_at:batch.archived_at,archive_reason:batch.archive_reason},newValues:{batch_code:batch.batch_code,archived_at:null,reason,authorization:'admin_password_email_code'},ipAddress:req.ip||null},conn)
    } else if (action === 'delete') {
      if (Number(batch.quantity||0)>0) throw Object.assign(new Error('A batch with remaining stock cannot be deleted.'), { statusCode:409 })
      const references = await getInventoryBatchReferenceCounts(batch.id, conn)
      if (batchHasProtectedHistory(references)) throw Object.assign(new Error('This batch has transaction history and cannot be hard deleted. Archive it instead.'), { statusCode:409, code:'BATCH_HAS_HISTORY' })
      await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.batch_deleted',entityType:'inventory_batch',entityId:batch.id,oldValues:{item_name:batch.item_name,batch_code:batch.batch_code,quantity:Number(batch.quantity||0),expiration_date:currentExpiry,unit_cost:Number(batch.unit_cost||0),reason,authorization:'admin_password_email_code'},ipAddress:req.ip||null},conn)
      await conn.query('DELETE FROM inventory_batches WHERE id=?', [batch.id])
      await syncInventorySnapshot(batch.inventory_id, conn)
      await syncLocationSnapshot(batch.inventory_id, conn)
    }

    await conn.commit()
    const refreshed = await loadInventoryRows(db, 'WHERE id = ?', [batch.inventory_id])
    const messages = {
      correct_quantity:'Batch quantity corrected.', correct_details:'Batch details corrected.', archive:'Batch archived.', restore:'Batch restored.', delete:'Batch deleted.',
    }
    res.json({ message:messages[action] || 'Batch updated.', item:refreshed[0] || null })
  } catch (error) {
    await conn.rollback()
    res.status(error.statusCode || 500).json({ message:error.message || 'Could not complete the batch action.', code:error.code || null })
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
      actorRole: 'admin',
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

// ── Supply Requests ───────────────────────────────────────────────────────────

const getSupplyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.category, i.unit, d.full_name AS doctor_name,
            COALESCE(dest.name, sr.destination_location) AS destination_location,
            COALESCE((SELECT SUM(ils.quantity) FROM inventory_location_stock ils JOIN inventory_locations ml ON ml.id=ils.location_id WHERE ils.inventory_id=i.id AND ml.name='Main Stockroom'),0) AS main_stockroom_stock,
            COALESCE((SELECT SUM(ils.quantity) FROM inventory_location_stock ils WHERE ils.inventory_id=i.id AND ils.location_id=sr.destination_location_id),0) AS destination_stock
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     JOIN doctors d ON sr.doctor_id = d.id
     LEFT JOIN inventory_locations dest ON dest.id=sr.destination_location_id
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

// ── Billing oversight / refunds / collection summary ─────────────────────────
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
            COALESCE(SUM(CASE WHEN payment_method='cash' AND status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS cash_collected
     FROM billing_payments WHERE DATE(paid_at)=?`, [date])
  const [[discounts]] = await db.query(
    `SELECT COALESCE(SUM(discount_amount),0) AS discounts FROM billing_records
     WHERE DATE(COALESCE(finalized_at,created_at))=? AND status <> 'voided'`, [date])

  res.json({
    date,
    methods,
    summary: { ...summary, discounts: Number(discounts?.discounts || 0) },
  })
}

const getBillingPaymentForProtectedAction = async (paymentId, executor = db, forUpdate = false) => {
  const [rows] = await executor.query(
    `SELECT bp.*, br.patient_id, br.total_amount AS billing_total_amount
     FROM billing_payments bp
     JOIN billing_records br ON br.id = bp.billing_id
     WHERE bp.id = ?
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [paymentId]
  )
  return rows[0] || null
}

const normalizeBillingPaymentAction = (action, body, payment) => {
  if (!BILLING_PAYMENT_ACTIONS.has(action)) throw Object.assign(new Error('Unsupported payment action.'), { statusCode: 400 })
  const reason = String(body?.reason || '').trim()
  if (reason.length < 5) throw Object.assign(new Error(`${action === 'refund' ? 'Refund' : 'Void'} reason must be at least 5 characters.`), { statusCode: 400 })
  if (reason.length > 500) throw Object.assign(new Error('Reason must be 500 characters or fewer.'), { statusCode: 400 })
  if (payment.status !== 'completed') throw Object.assign(new Error(`Only completed payments can be ${action === 'refund' ? 'refunded' : 'voided'}.`), { statusCode: 409 })

  const available = Math.max(0, Number(payment.amount || 0) - Number(payment.refund_amount || 0))
  if (action === 'void') {
    if (Number(payment.refund_amount || 0) > 0) {
      throw Object.assign(new Error('This payment already has a refund and can no longer be voided. Refund the remaining refundable amount instead.'), { statusCode: 409, code: 'PAYMENT_ALREADY_REFUNDED' })
    }
    return { reason }
  }

  const amount = body?.amount === undefined || body?.amount === null || body?.amount === '' ? available : Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > available + 0.001) {
    throw Object.assign(new Error(`Refund amount must be greater than zero and cannot exceed the refundable amount of ₱${available.toFixed(2)}.`), { statusCode: 400, code: 'INVALID_REFUND_AMOUNT', max_refundable: available })
  }
  return { reason, amount: Math.round(amount * 100) / 100 }
}

const requestBillingPaymentActionCode = async (req, res, forcedAction = null) => {
  const paymentId = Number(req.params.paymentId)
  const action = forcedAction || String(req.body?.action || '').trim().toLowerCase()
  if (!paymentId || !BILLING_PAYMENT_ACTIONS.has(action)) return res.status(400).json({ message: 'Select a valid payment action.' })

  const payment = await getBillingPaymentForProtectedAction(paymentId)
  if (!payment) return res.status(404).json({ message: 'Payment not found.' })

  let requested
  try { requested = normalizeBillingPaymentAction(action, req.body, payment) }
  catch (error) { return res.status(error.statusCode || 400).json({ message: error.message, code: error.code || null, max_refundable: error.max_refundable }) }

  const [[admin]] = await db.query('SELECT id,full_name,email,password FROM admins WHERE id=? LIMIT 1', [req.user.id])
  if (!admin) return res.status(404).json({ message: 'Administrator account not found.' })
  const password = String(req.body?.password || '')
  if (!password) return res.status(400).json({ message: 'Admin password is required.' })
  const passwordMatches = await bcrypt.compare(password, admin.password)
  if (!passwordMatches) return res.status(401).json({ message: 'Admin password is incorrect.' })
  if (!admin.email) return res.status(400).json({ message: 'The administrator account needs an email address for verification.' })

  const authorizationPayload = {
    action,
    payment_id: payment.id,
    billing_id: payment.billing_id,
    old: {
      status: payment.status,
      amount: Number(payment.amount || 0),
      refund_amount: Number(payment.refund_amount || 0),
      reference_number: payment.reference_number || null,
    },
    requested,
  }

  try {
    const code = await createSecurityCode({
      role: 'admin', accountId: req.user.id, purpose: BILLING_PAYMENT_ACTION_PURPOSE, payload: authorizationPayload,
    })
    await sendAccountSecurityOtp(admin.email, admin.full_name, code)
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',action:'billing.payment_action_verification_requested',entityType:'billing_payment',entityId:payment.id,
      newValues:{ action, billing_id:payment.billing_id, reason:requested.reason, refund_amount:requested.amount || null },ipAddress:req.ip||null,
    }).catch(() => {})
    return res.json({
      message: `Password verified. A 6-digit verification code was sent to ${maskEmailAddress(admin.email)}.`,
      destination: maskEmailAddress(admin.email),
      action,
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Could not send the verification code.' })
  }
}

const voidBillingPayment = async (req, res) => requestBillingPaymentActionCode(req, res, 'void')
const refundBillingPayment = async (req, res) => requestBillingPaymentActionCode(req, res, 'refund')

const confirmBillingPaymentAction = async (req, res) => {
  const routePaymentId = Number(req.params.paymentId)
  const code = String(req.body?.code || '').trim()
  if (!routePaymentId || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter the 6-digit email verification code.' })

  let verified
  try {
    verified = await verifySecurityCode({ role:'admin', accountId:req.user.id, purpose:BILLING_PAYMENT_ACTION_PURPOSE, code })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid or expired verification code.' })
  }

  const authorization = verified.payload || {}
  const action = String(authorization.action || '')
  const paymentId = Number(authorization.payment_id)
  if (!BILLING_PAYMENT_ACTIONS.has(action) || paymentId !== routePaymentId) {
    return res.status(400).json({ message: 'This verification code does not authorize the selected payment action.' })
  }

  const conn = await db.getConnection()
  let billingId = null
  try {
    await conn.beginTransaction()
    const payment = await getBillingPaymentForProtectedAction(paymentId, conn, true)
    if (!payment) throw Object.assign(new Error('Payment not found.'), { statusCode: 404 })
    billingId = payment.billing_id

    const expected = authorization.old || {}
    if (
      String(payment.status || '') !== String(expected.status || '') ||
      Math.abs(Number(payment.amount || 0) - Number(expected.amount || 0)) > 0.001 ||
      Math.abs(Number(payment.refund_amount || 0) - Number(expected.refund_amount || 0)) > 0.001 ||
      String(payment.reference_number || '') !== String(expected.reference_number || '')
    ) {
      throw Object.assign(new Error('This payment changed after verification was requested. Review the latest transaction and request a new code.'), { statusCode: 409, code: 'PAYMENT_CHANGED' })
    }

    const requested = authorization.requested || {}
    const normalized = normalizeBillingPaymentAction(action, requested, payment)

    if (action === 'void') {
      await conn.query(`UPDATE billing_payments SET status='voided', voided_at=NOW(), void_reason=? WHERE id=?`, [normalized.reason, paymentId])
    } else {
      const nextRefund = Math.round((Number(payment.refund_amount || 0) + Number(normalized.amount || 0)) * 100) / 100
      await conn.query(`UPDATE billing_payments SET refund_amount=?, refunded_at=NOW(), refund_reason=?, refunded_by_admin_id=? WHERE id=?`, [nextRefund, normalized.reason, req.user.id, paymentId])
    }

    const bill = await getBillingRecordWithItems(billingId, conn)
    const paidAfter = Math.max(0, Number(bill.paid_amount || 0))
    const balanceAfter = Math.max(0, Number(bill.total_amount || 0) - paidAfter)
    const nextStatus = paidAfter <= 0 ? 'ready' : balanceAfter <= 0 ? 'paid' : 'partially_paid'
    await conn.query(`UPDATE billing_records SET status=?, paid_at=CASE WHEN ?='paid' THEN paid_at ELSE NULL END WHERE id=?`, [nextStatus, nextStatus, billingId])

    if (action === 'void') {
      await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'billing.payment_voided',entityType:'billing_payment',entityId:paymentId,oldValues:{status:'completed',amount:payment.amount},newValues:{status:'voided',reason:normalized.reason,billing_status:nextStatus,authorization:'admin_password_email_code'},ipAddress:req.ip||null },conn)
    } else {
      const nextRefund = Math.round((Number(payment.refund_amount || 0) + Number(normalized.amount || 0)) * 100) / 100
      await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'billing.payment_refunded',entityType:'billing_payment',entityId:paymentId,oldValues:{refund_amount:payment.refund_amount||0},newValues:{refund_amount:nextRefund,refund_delta:normalized.amount,reason:normalized.reason,billing_status:nextStatus,balance_after:balanceAfter,authorization:'admin_password_email_code'},ipAddress:req.ip||null},conn)
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    return res.status(error.statusCode || 500).json({ message: error.message || 'Payment action failed.', code: error.code || null, max_refundable: error.max_refundable })
  } finally {
    conn.release()
  }

  broadcast(['admin','staff'], 'billing_payment_changed', { billingId, paymentId, action: action === 'void' ? 'voided' : 'refunded' })
  return res.json(await getBillingRecordWithItems(billingId))
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
                 [payload.clinic_name,payload.address,payload.phone,payload.email,payload.report_footer,payload.receipt_title,payload.receipt_footer,req.user?.role === 'admin' ? req.user.id : null])
  await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'settings.clinic_updated',entityType:'clinic_settings',entityId:'1',oldValues:oldRows[0]||null,newValues:payload,ipAddress:req.ip||null})
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
    await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:`billing.adjustment_${status}`,entityType:'billing_adjustment_request',entityId:id,oldValues:{status:'pending'},newValues:{status,admin_note:reason,bill_version:request.bill_version},ipAddress:req.ip||null }, conn)
    await conn.commit()
  } catch (err) { await conn.rollback(); throw err } finally { conn.release() }
  broadcast(['admin', 'staff'], 'billing_adjustment_resolved', { requestId: id, status })
  const [updated] = await db.query('SELECT * FROM billing_adjustment_requests WHERE id = ?', [id])
  res.json(updated[0])
}

// ── Discount presets ──────────────────────────────────────────────────────────

const getDiscountPresetsAdmin = async (req,res) => {
  const [rows]=await db.query('SELECT * FROM discount_presets ORDER BY created_at ASC, id ASC');res.json(rows)
}
const saveDiscountPresetAdmin = async (req,res) => {
  const id=Number(req.params.id)||0
  const discountType=['percentage','fixed'].includes(req.body.discount_type)?req.body.discount_type:'fixed'
  const value=Math.max(0,Number(req.body.value)||0)
  if(discountType==='percentage' && value>100) return res.status(400).json({code:'INVALID_DISCOUNT_PERCENTAGE',message:'Percentage discount cannot exceed 100%.'})
  const payload={label:String(req.body.label||'').trim(),discount_type:discountType,value,requires_reference:req.body.requires_reference?1:0,requires_admin_approval:req.body.requires_admin_approval?1:0,is_active:req.body.is_active===0||req.body.is_active===false?0:1}
  if(!payload.label)return res.status(400).json({message:'Discount label is required.'})
  if(id && !payload.is_active){
    const [[pending]]=await db.query(`SELECT COUNT(*) AS total FROM billing_adjustment_requests WHERE discount_preset_id=? AND status='pending'`,[id])
    if(Number(pending?.total||0)>0) return res.status(409).json({code:'PENDING_DISCOUNT_REQUESTS',message:`Resolve ${Number(pending.total)} pending billing request${Number(pending.total)===1?'':'s'} before deactivating this discount.`,pending_count:Number(pending.total)})
  }
  let targetId=id
  if(id){ await db.query(`UPDATE discount_presets SET label=?,discount_type=?,value=?,requires_reference=?,requires_admin_approval=?,is_active=? WHERE id=?`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active,id]) }
  else { const [r]=await db.query(`INSERT INTO discount_presets (label,discount_type,value,requires_reference,requires_admin_approval,is_active) VALUES (?,?,?,?,?,?)`,[payload.label,payload.discount_type,payload.value,payload.requires_reference,payload.requires_admin_approval,payload.is_active]); targetId=r.insertId }
  await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:id?'billing.discount_preset_updated':'billing.discount_preset_created',entityType:'discount_preset',entityId:targetId,newValues:payload,ipAddress:req.ip||null})
  const [rows]=await db.query('SELECT * FROM discount_presets WHERE id=?',[targetId]);res.status(id?200:201).json(rows[0])
}

// ── System setup / inventory reference data ──────────────────────────────────
const getSystemSetup = async (req, res) => {
  const [visitReasons, serviceCategories, uoms, suppliers, locationTypes, movementReasons] = await Promise.all([
    db.query('SELECT id,label,clinic_type,is_active,sort_order FROM appointment_reason_options ORDER BY sort_order,label'),
    db.query(`SELECT c.id,c.name,c.clinic_type,c.is_active,COUNT(s.id) AS service_count
              FROM billing_service_categories c
              LEFT JOIN billing_service_catalog s ON s.category_id=c.id
              GROUP BY c.id,c.name,c.clinic_type,c.is_active
              ORDER BY c.name ASC`),
    db.query(`SELECT u.id,u.name,u.allow_decimal_quantity,u.decimal_precision,u.is_active,u.sort_order,
                     (SELECT COUNT(*) FROM inventory i WHERE LOWER(COALESCE(i.uom,i.base_unit,i.unit,''))=LOWER(u.name)) AS inventory_count
              FROM inventory_uoms u ORDER BY u.sort_order,u.name`),
    db.query('SELECT id,name,contact_person,contact_number,address,category,is_active FROM inventory_suppliers ORDER BY name ASC'),
    db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types ORDER BY sort_order,name'),
    db.query(`SELECT id,name,code,movement_type,requires_batch,is_system,is_active,created_at
              FROM inventory_movement_reasons
              ORDER BY FIELD(movement_type,'in','out'), is_system DESC, name ASC`),
  ])
  res.json({
    visit_reasons: visitReasons[0],
    service_categories: serviceCategories[0],
    uoms: uoms[0],
    suppliers: suppliers[0],
    location_types: locationTypes[0],
    movement_reasons: movementReasons[0],
  })
}

const saveBillingServiceCategory = async (req, res) => {
  const id = Number(req.params.id || 0)
  const name = normalizeText(req.body?.name, { field: 'Service Category name', required: true, max: 120 })
  const clinicType = ['medical','derma'].includes(String(req.body?.clinic_type || '')) ? String(req.body.clinic_type) : null
  const isActive = req.body?.is_active === false || Number(req.body?.is_active) === 0 ? 0 : 1
  if (!name || !clinicType) return res.status(400).json({ message: 'Service Category name and clinic are required.' })

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    let targetId = id
    let oldValues = null

    if (id) {
      const [[existing]] = await conn.query(
        'SELECT id,name,clinic_type,is_active FROM billing_service_categories WHERE id=? FOR UPDATE',
        [id]
      )
      if (!existing) {
        await conn.rollback()
        return res.status(404).json({ message: 'Service Category not found.' })
      }
      oldValues = existing

      const [[usage]] = await conn.query(
        'SELECT COUNT(*) AS total FROM billing_service_catalog WHERE category_id=?',
        [id]
      )
      if (existing.clinic_type !== clinicType && Number(usage?.total || 0) > 0) {
        await conn.rollback()
        return res.status(409).json({
          message: 'This Service Category is already used by services. Keep its clinic assignment and edit only its name or status.',
          code: 'SERVICE_CATEGORY_CLINIC_IN_USE',
        })
      }

      await conn.query(
        'UPDATE billing_service_categories SET name=?,clinic_type=?,is_active=? WHERE id=?',
        [name,clinicType,isActive,id]
      )

      // Keep the legacy category text synchronized for reports/billing snapshots
      // that still read billing_service_catalog.category directly.
      await conn.query(
        'UPDATE billing_service_catalog SET category=? WHERE category_id=?',
        [name,id]
      )
    } else {
      const [result] = await conn.query(
        'INSERT INTO billing_service_categories (name,clinic_type,is_active,sort_order) VALUES (?,?,?,0)',
        [name,clinicType,isActive]
      )
      targetId = result.insertId
    }

    const [[row]] = await conn.query(
      'SELECT id,name,clinic_type,is_active FROM billing_service_categories WHERE id=?',
      [targetId]
    )
    await writeAuditLog({
      userId:req.user.id,
      userRole:req.user?.role || 'admin',
      action:id?'system.service_category_updated':'system.service_category_created',
      entityType:'billing_service_category',
      entityId:targetId,
      oldValues,
      newValues:row,
      ipAddress:req.ip||null,
    }, conn)
    await conn.commit()
    res.status(id ? 200 : 201).json(row)
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That Service Category already exists for this clinic.' })
    }
    throw err
  } finally {
    conn.release()
  }
}

const saveInventoryUom = async (req, res) => {
  const id = Number(req.params.id || 0)
  const name = normalizeText(req.body?.name, { field: 'Unit of Measure name', required: true, max: 80 })
  const isActive = req.body?.is_active === false || Number(req.body?.is_active) === 0 ? 0 : 1
  const sortOrder = Number(req.body?.sort_order || 0)
  const allowDecimal = req.body?.allow_decimal_quantity === true || Number(req.body?.allow_decimal_quantity) === 1 ? 1 : 0
  // CARAIT uses one fixed decimal policy: measured UOMs support 2 decimal places.
  const decimalPrecision = allowDecimal ? 2 : 0
  if (!name) return res.status(400).json({ message: 'Unit of Measure name is required.' })
  try {
    let targetId = id
    if (id) {
      const [[current]] = await db.query('SELECT id,name FROM inventory_uoms WHERE id=? LIMIT 1', [id])
      if (!current) return res.status(404).json({ message: 'Unit of Measure not found.' })
      if (String(current.name).toLowerCase() !== String(name).toLowerCase()) {
        const [[usage]] = await db.query(`SELECT COUNT(*) AS total FROM inventory
                                          WHERE LOWER(COALESCE(uom,base_unit,unit,''))=LOWER(?)`, [current.name])
        if (Number(usage?.total || 0) > 0) {
          return res.status(409).json({
            code: 'UOM_NAME_IN_USE',
            message: 'This Unit of Measure is already used by inventory items. Keep its name and edit only its decimal rule or status.',
          })
        }
      }
      await db.query('UPDATE inventory_uoms SET name=?,allow_decimal_quantity=?,decimal_precision=?,is_active=?,sort_order=? WHERE id=?', [name,allowDecimal,decimalPrecision,isActive,sortOrder,id])
    } else {
      const [result] = await db.query('INSERT INTO inventory_uoms (name,allow_decimal_quantity,decimal_precision,is_active,sort_order) VALUES (?,?,?,?,?)', [name,allowDecimal,decimalPrecision,isActive,sortOrder])
      targetId = result.insertId
    }
    await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:id?'system.uom_updated':'system.uom_created',entityType:'inventory_uom',entityId:targetId,newValues:{name,allow_decimal_quantity:allowDecimal,decimal_precision:decimalPrecision,is_active:isActive},ipAddress:req.ip||null })
    const [[row]] = await db.query('SELECT id,name,allow_decimal_quantity,decimal_precision,is_active,sort_order FROM inventory_uoms WHERE id=?',[targetId])
    res.status(id ? 200 : 201).json(row)
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That Unit of Measure already exists.' })
    throw err
  }
}

const deleteBillingServiceCategory = async (req, res) => {
  const id = Number(req.params.id || 0)
  if (!id) return res.status(400).json({ message: 'A valid Service Category is required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[category]] = await conn.query('SELECT id,name,clinic_type,is_active FROM billing_service_categories WHERE id=? FOR UPDATE', [id])
    if (!category) { await conn.rollback(); return res.status(404).json({ message: 'Service Category not found.' }) }
    const [[usage]] = await conn.query('SELECT COUNT(*) AS total FROM billing_service_catalog WHERE category_id=?', [id])
    const total = Number(usage?.total || 0)
    if (total > 0) {
      await conn.rollback()
      return res.status(409).json({ code:'SERVICE_CATEGORY_IN_USE', service_count:total, message:`This Service Category is used by ${total} service${total === 1 ? '' : 's'} and cannot be permanently deleted. Deactivate it instead.` })
    }
    await conn.query('DELETE FROM billing_service_categories WHERE id=?', [id])
    await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'system.service_category_deleted',entityType:'billing_service_category',entityId:id,oldValues:category,ipAddress:req.ip||null }, conn)
    await conn.commit()
    res.json({ message: 'Service Category deleted.' })
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally { conn.release() }
}

const deleteInventoryUom = async (req, res) => {
  const id = Number(req.params.id || 0)
  if (!id) return res.status(400).json({ message: 'A valid Unit of Measure is required.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[uom]] = await conn.query('SELECT id,name,allow_decimal_quantity,decimal_precision,is_active,sort_order FROM inventory_uoms WHERE id=? FOR UPDATE', [id])
    if (!uom) { await conn.rollback(); return res.status(404).json({ message: 'Unit of Measure not found.' }) }
    const [[usage]] = await conn.query(`SELECT COUNT(*) AS total FROM inventory
                                        WHERE LOWER(COALESCE(uom,base_unit,unit,''))=LOWER(?)`, [uom.name])
    const total = Number(usage?.total || 0)
    if (total > 0) {
      await conn.rollback()
      return res.status(409).json({ code:'UOM_IN_USE', inventory_count:total, message:`This Unit of Measure is used by ${total} inventory item${total === 1 ? '' : 's'} and cannot be permanently deleted. Deactivate it instead.` })
    }
    await conn.query('DELETE FROM inventory_uoms WHERE id=?', [id])
    await writeAuditLog({ userId:req.user.id,userRole:req.user?.role || 'admin',action:'system.uom_deleted',entityType:'inventory_uom',entityId:id,oldValues:uom,ipAddress:req.ip||null }, conn)
    await conn.commit()
    res.json({ message: 'Unit of Measure deleted.' })
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally { conn.release() }
}

const saveInventorySupplier = async (req, res) => {
  const id = Number(req.params.id || 0)
  const name = String(req.body?.name || '').trim()
  const contactPerson = String(req.body?.contact_person || '').trim() || null
  const contactNumber = String(req.body?.contact_number || '').trim() || null
  const address = String(req.body?.address || '').trim() || null
  const clinics = normalizeSupplierClinics(req.body)
  const category = clinics.join(',')
  const isActive = req.body?.is_active === false || Number(req.body?.is_active) === 0 ? 0 : 1
  if (!name || !clinics.length) return res.status(400).json({ message: 'Company / Supplier Name and at least one clinic are required.' })
  try {
    let targetId=id
    if (id) {
      const [[current]] = await db.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? LIMIT 1',[id])
      if (!current) return res.status(404).json({ message: 'Supplier not found.' })
      for (const clinic of ['medical','derma']) {
        if (supplierSupportsClinic(current.category, clinic) && !clinics.includes(clinic)) {
          const [[usage]] = await db.query('SELECT COUNT(*) AS total FROM inventory WHERE supplier_id=? AND category=?',[id,clinic])
          if (Number(usage?.total || 0) > 0) {
            return res.status(409).json({ message: `Cannot remove ${clinic === 'derma' ? 'Dermatology' : 'General Medicine'} because this supplier is assigned to ${Number(usage.total)} inventory item${Number(usage.total) === 1 ? '' : 's'} in that clinic.` })
          }
        }
      }
      const [result] = await db.query(
        'UPDATE inventory_suppliers SET name=?,contact_person=?,contact_number=?,address=?,category=?,is_active=? WHERE id=?',
        [name,contactPerson,contactNumber,address,category,isActive,id]
      )
      if (!result.affectedRows) return res.status(404).json({ message: 'Supplier not found.' })
    } else {
      const [sameNameRows] = await db.query('SELECT id FROM inventory_suppliers WHERE name=? LIMIT 1',[name])
      if (sameNameRows.length) return res.status(409).json({ message: 'That supplier/company already exists. Edit the existing supplier to change its clinic coverage.' })
      const [result]=await db.query(
        'INSERT INTO inventory_suppliers (name,contact_person,contact_number,address,category,is_active) VALUES (?,?,?,?,?,?)',
        [name,contactPerson,contactNumber,address,category,isActive]
      )
      targetId=result.insertId
    }
    const payload={name,contact_person:contactPerson,contact_number:contactNumber,address,category,clinics,is_active:isActive}
    await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:id?'system.supplier_updated':'system.supplier_created',entityType:'inventory_supplier',entityId:targetId,newValues:payload,ipAddress:req.ip||null})
    const [[row]]=await db.query('SELECT id,name,contact_person,contact_number,address,category,is_active FROM inventory_suppliers WHERE id=?',[targetId])
    res.status(id?200:201).json(row)
  } catch(err){ if(err.code==='ER_DUP_ENTRY') return res.status(409).json({message:'That supplier/company already exists with the same clinic coverage.'}); throw err }
}

const saveInventoryLocationType = async (req,res) => {
  const id = Number(req.params.id || 0)
  const name = normalizeText(req.body?.name, { field: 'Storage Classification name', required: true, max: 80 })
  const isActive = req.body?.is_active === false || Number(req.body?.is_active) === 0 ? 0 : 1
  const sortOrder = normalizeNumber(req.body?.sort_order ?? 0, { field: 'Sort Order', min: -999999, max: 999999, integer: true }) ?? 0

  try {
    let targetId = id
    let code

    if (id) {
      const [[existing]] = await db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types WHERE id=?', [id])
      if (!existing) return res.status(404).json({ message: 'Location Type not found.' })

      if (!isActive) {
        const [[usage]] = await db.query('SELECT COUNT(*) AS total FROM inventory WHERE location_type_id=?', [id])
        if (Number(usage?.total || 0) > 0) {
          return res.status(409).json({
            message: 'This Location Type is assigned to inventory items. Reassign those items before deactivating it.',
            code: 'LOCATION_TYPE_IN_USE',
          })
        }
      }

      code = existing.code
      await db.query(
        'UPDATE inventory_location_types SET name=?,is_active=?,sort_order=? WHERE id=?',
        [name, isActive, sortOrder, id]
      )
    } else {
      code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      if (!code) return res.status(400).json({ message: 'Enter a valid Location Type name.' })
      const [result] = await db.query(
        'INSERT INTO inventory_location_types (name,code,is_active,sort_order) VALUES (?,?,?,?)',
        [name, code, isActive, sortOrder]
      )
      targetId = result.insertId
    }

    await writeAuditLog({
      userId: req.user.id,
      userRole: req.user?.role || 'admin',
      action: id ? 'system.location_type_updated' : 'system.location_type_created',
      entityType: 'inventory_location_type',
      entityId: targetId,
      newValues: { name, code, is_active: isActive, sort_order: sortOrder },
      ipAddress: req.ip || null,
    })

    const [[row]] = await db.query(
      'SELECT id,name,code,is_active,sort_order FROM inventory_location_types WHERE id=?',
      [targetId]
    )
    res.status(id ? 200 : 201).json(row)
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That Location Type already exists.' })
    throw err
  }
}

const saveInventoryMovementReason = async (req, res) => {
  const id = Number(req.params.id || 0)
  const name = normalizeText(req.body?.name, { field: 'Movement Reason name', required: true, max: 120 })
  const requestedType = ['in','out'].includes(String(req.body?.movement_type || '')) ? String(req.body.movement_type) : null
  const requiresBatch = req.body?.requires_batch === true || Number(req.body?.requires_batch) === 1 ? 1 : 0
  const isActive = req.body?.is_active === false || Number(req.body?.is_active) === 0 ? 0 : 1
  if (!name || !requestedType) return res.status(400).json({ message: 'Movement reason name and movement type are required.' })

  const protectedCodes = new Set(['received','correction_in','adjustment_out'])
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    let targetId = id
    let code = ''
    let movementType = requestedType
    let isSystem = 0
    let oldValues = null

    if (id) {
      const [[existing]] = await conn.query(
        'SELECT id,name,code,movement_type,requires_batch,is_system,is_active FROM inventory_movement_reasons WHERE id=? FOR UPDATE',
        [id]
      )
      if (!existing) { await conn.rollback(); return res.status(404).json({ message: 'Movement reason not found.' }) }
      oldValues = existing
      code = existing.code
      isSystem = Number(existing.is_system || 0)

      if (isSystem && requestedType !== existing.movement_type) {
        await conn.rollback()
        return res.status(409).json({ code:'SYSTEM_MOVEMENT_TYPE_LOCKED', message:'Built-in movement reasons cannot be changed between Stock In and Stock Out.' })
      }
      if (!isSystem && requestedType !== existing.movement_type) {
        const [[usage]] = await conn.query('SELECT COUNT(*) AS total FROM inventory_logs WHERE movement_type=?', [existing.code])
        if (Number(usage?.total || 0) > 0) {
          await conn.rollback()
          return res.status(409).json({ code:'MOVEMENT_REASON_IN_USE', message:'This movement reason already has inventory history. Its Stock In / Stock Out type can no longer be changed.' })
        }
      }
      movementType = isSystem ? existing.movement_type : requestedType

      if (!isActive && protectedCodes.has(code)) {
        await conn.rollback()
        return res.status(409).json({ code:'PROTECTED_MOVEMENT_REASON', message:'This core movement reason is required by inventory correction/receiving workflows and cannot be deactivated. You can rename its visible label.' })
      }
      if (!isActive && Number(existing.is_active) === 1) {
        const [[remaining]] = await conn.query(
          'SELECT COUNT(*) AS total FROM inventory_movement_reasons WHERE movement_type=? AND is_active=1 AND id<>?',
          [movementType,id]
        )
        if (Number(remaining?.total || 0) === 0) {
          await conn.rollback()
          return res.status(409).json({ code:'LAST_ACTIVE_MOVEMENT_REASON', message:`Keep at least one active Stock ${movementType === 'in' ? 'In' : 'Out'} movement reason.` })
        }
      }

      await conn.query(
        'UPDATE inventory_movement_reasons SET name=?,movement_type=?,requires_batch=?,is_active=? WHERE id=?',
        [name,movementType,requiresBatch,isActive,id]
      )
    } else {
      const baseCode = name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)
      if (!baseCode) { await conn.rollback(); return res.status(400).json({ message:'Enter a valid movement reason name.' }) }
      code = baseCode
      let suffix = 2
      while (true) {
        const [[duplicate]] = await conn.query('SELECT id FROM inventory_movement_reasons WHERE code=? LIMIT 1', [code])
        if (!duplicate) break
        code = `${baseCode}_${suffix++}`
      }
      const [result] = await conn.query(
        'INSERT INTO inventory_movement_reasons (name,code,movement_type,requires_batch,is_system,is_active) VALUES (?,?,?,?,0,?)',
        [name,code,movementType,requiresBatch,isActive]
      )
      targetId = result.insertId
    }

    const [[row]] = await conn.query(
      'SELECT id,name,code,movement_type,requires_batch,is_system,is_active,created_at FROM inventory_movement_reasons WHERE id=?',
      [targetId]
    )
    await writeAuditLog({
      userId:req.user.id,userRole:req.user?.role || 'admin',
      action:id?'system.movement_reason_updated':'system.movement_reason_created',
      entityType:'inventory_movement_reason',entityId:targetId,oldValues,newValues:row,ipAddress:req.ip||null,
    }, conn)
    await conn.commit()
    res.status(id ? 200 : 201).json(row)
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message:'That movement reason already exists.' })
    throw err
  } finally { conn.release() }
}


const getInventoryLocationsAdmin = async (req,res) => {
  const [rows]=await db.query(`SELECT l.id,l.name,l.location_type,l.is_active,l.created_at,
      COUNT(DISTINCT CASE WHEN ilb.quantity>0 THEN ilb.inventory_id END) AS item_count,
      COUNT(DISTINCT CASE WHEN ilb.quantity>0 THEN ilb.batch_id END) AS batch_count,
      COALESCE(SUM(CASE WHEN ilb.quantity>0 THEN ilb.quantity ELSE 0 END),0) AS total_quantity
    FROM inventory_locations l
    LEFT JOIN inventory_location_batches ilb ON ilb.location_id=l.id
    GROUP BY l.id
    ORDER BY l.is_active DESC,l.name`)
  res.json(rows)
}

const updateInventoryLocation = async (req,res) => {
  const id=Number(req.params.id)
  const name=normalizeText(req.body?.name,{field:'Storage Location name',required:true,max:120})
  const locationType=normalizeText(req.body?.location_type,{field:'Storage Location type',required:true,max:40})
  const isActive=req.body?.is_active===false||Number(req.body?.is_active)===0?0:1
  if(!id||!name||!locationType) return res.status(400).json({message:'Location name and type are required.'})
  const [[current]]=await db.query('SELECT * FROM inventory_locations WHERE id=?',[id])
  if(!current) return res.status(404).json({message:'Storage location not found.'})
  if(!isActive){
    const [[stock]]=await db.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory_location_batches WHERE location_id=? AND quantity>0',[id])
    if(Number(stock?.qty||0)>0) return res.status(409).json({message:'Move all remaining stock out of this location before deactivating it.',code:'LOCATION_HAS_STOCK'})
  }
  try{
    await db.query('UPDATE inventory_locations SET name=?,location_type=?,is_active=? WHERE id=?',[name,locationType,isActive,id])
    await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.location_updated',entityType:'inventory_location',entityId:id,oldValues:current,newValues:{name,location_type:locationType,is_active:isActive},ipAddress:req.ip||null})
    const [[row]]=await db.query('SELECT * FROM inventory_locations WHERE id=?',[id]);res.json(row)
  }catch(err){if(err.code==='ER_DUP_ENTRY') return res.status(409).json({message:'That storage location name already exists.'});throw err}
}

const deleteInventoryLocation = async (req,res) => {
  const id=Number(req.params.id)
  const [[current]]=await db.query('SELECT * FROM inventory_locations WHERE id=?',[id])
  if(!current) return res.status(404).json({message:'Storage location not found.'})
  const [[usage]]=await db.query(`SELECT
    (SELECT COUNT(*) FROM inventory_location_batches WHERE location_id=?) +
    (SELECT COUNT(*) FROM inventory_location_stock WHERE location_id=?) +
    (SELECT COUNT(*) FROM supply_requests WHERE destination_location_id=?) AS total`,[id,id,id])
  if(Number(usage?.total||0)>0) return res.status(409).json({message:'This location has inventory or transaction history and cannot be deleted. Deactivate it instead.',code:'LOCATION_REFERENCED'})
  await db.query('DELETE FROM inventory_locations WHERE id=?',[id])
  await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'inventory.location_deleted',entityType:'inventory_location',entityId:id,oldValues:current,ipAddress:req.ip||null})
  res.json({message:'Storage location deleted.'})
}

// ── Audit archive ─────────────────────────────────────────────────────────────
const getAuditArchiveBatches = async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(50,Math.max(1,Number(req.query.limit)||10)),offset=(page-1)*limit
  const [[count]]=await db.query('SELECT COUNT(*) AS total FROM audit_log_archives')
  const [items]=await db.query(`SELECT aa.*,a.full_name AS archived_by FROM audit_log_archives aa LEFT JOIN admins a ON a.id=aa.archived_by_admin_id ORDER BY aa.archived_at DESC LIMIT ? OFFSET ?`,[limit,offset])
  const total=Number(count?.total||0);res.json({items,pagination:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}})
}

const getAuditArchiveDetail = async (req,res) => {
  const id=Number(req.params.archiveId),page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)),offset=(page-1)*limit
  const [[archive]]=await db.query('SELECT * FROM audit_log_archives WHERE id=?',[id]);if(!archive)return res.status(404).json({message:'Archive not found.'})
  const [[count]]=await db.query('SELECT COUNT(*) AS total FROM audit_logs WHERE archive_id=?',[id])
  const [items]=await db.query('SELECT * FROM audit_logs WHERE archive_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',[id,limit,offset])
  const total=Number(count?.total||0);res.json({archive,items,pagination:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}})
}

const archiveAuditLogs = async (req,res) => {
  const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1)
  const cutoffSql=cutoff.toISOString().slice(0,19).replace('T',' ')
  const conn=await db.getConnection()
  try{
    await conn.beginTransaction()
    const [[eligible]]=await conn.query('SELECT COUNT(*) AS total,MIN(created_at) AS oldest,MAX(created_at) AS newest FROM audit_logs WHERE archive_id IS NULL AND created_at <= ?',[cutoffSql])
    if(Number(eligible?.total||0)===0){await conn.rollback();return res.status(409).json({message:'No audit logs are old enough to archive. Logs must be at least 1 year old.',code:'NO_ELIGIBLE_AUDIT_LOGS'})}
    const code=`ARC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-6)}`
    const [result]=await conn.query('INSERT INTO audit_log_archives (archive_code,cutoff_at,log_count,archived_by_admin_id) VALUES (?,?,?,?)',[code,cutoffSql,Number(eligible.total),req.user.id])
    await conn.query('UPDATE audit_logs SET archive_id=?,archived_at=NOW() WHERE archive_id IS NULL AND created_at <= ?',[result.insertId,cutoffSql])
    await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'audit.archive_created',entityType:'audit_archive',entityId:result.insertId,newValues:{archive_code:code,log_count:Number(eligible.total),cutoff_at:cutoffSql},ipAddress:req.ip||null},conn)
    await conn.commit();res.status(201).json({id:result.insertId,archive_code:code,log_count:Number(eligible.total),cutoff_at:cutoffSql})
  }catch(err){await conn.rollback();throw err}finally{conn.release()}
}

const deleteAuditArchive = async (req,res) => {
  const id=Number(req.params.archiveId),reason=String(req.body?.reason||'').trim(),confirmation=String(req.body?.confirmation||'').trim()
  if(confirmation!=='DELETE') return res.status(400).json({message:'Type DELETE to confirm permanent archive deletion.'})
  if(!reason) return res.status(400).json({message:'A deletion reason is required.'})
  const conn=await db.getConnection()
  try{
    await conn.beginTransaction();const [[archive]]=await conn.query('SELECT * FROM audit_log_archives WHERE id=? FOR UPDATE',[id]);if(!archive){await conn.rollback();return res.status(404).json({message:'Archive not found.'})}
    await conn.query('DELETE FROM audit_logs WHERE archive_id=?',[id]);await conn.query('DELETE FROM audit_log_archives WHERE id=?',[id])
    await writeAuditLog({userId:req.user.id,userRole:req.user?.role || 'admin',action:'audit.archive_deleted',entityType:'audit_archive',entityId:id,oldValues:{archive_code:archive.archive_code,log_count:archive.log_count},newValues:{reason},ipAddress:req.ip||null},conn)
    await conn.commit();res.json({message:'Archived audit log batch permanently deleted.'})
  }catch(err){await conn.rollback();throw err}finally{conn.release()}
}

// ── System audit log ──────────────────────────────────────────────────────────
const getAuditLogs = async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)), offset=(page-1)*limit
  const sortDirection = String(req.query.direction || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  // MFA challenge/verification events stay in the database for security forensics,
  // but they are intentionally hidden from the normal Admin activity feed.
  const filters=["al.archive_id IS NULL", "al.action NOT IN ('auth.mfa_challenge_sent','auth.mfa_verified')"],params=[]
  if(req.query.start_date){filters.push('DATE(al.created_at)>=?');params.push(String(req.query.start_date))}
  if(req.query.end_date){filters.push('DATE(al.created_at)<=?');params.push(String(req.query.end_date))}
  if(req.query.user_role){filters.push('al.user_role=?');params.push(String(req.query.user_role))}
  if(req.query.entity_type){filters.push('al.entity_type=?');params.push(String(req.query.entity_type))}
  if(req.query.area){
    const area=String(req.query.area)
    const areaTypes={
      appointments:['appointment'],
      doctor_schedule:['doctor_schedule','doctor_unavailable_date'],
      inventory:['inventory_item','inventory_movement_reason'],
      stock_transfers:['supply_request'],
      billing:['billing_record','billing_payment','billing_adjustment_request','cashier_closing','discount_preset','clinic_payment_settings'],
      service_catalog:['billing_service','billing_service_category'],
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
      ${finalWhere} ORDER BY al.created_at ${sortDirection},al.id ${sortDirection} LIMIT ? OFFSET ?`,[...params,limit,offset])
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
  getBillingReconciliation, getBillingAdjustmentRequestsAdmin, resolveBillingAdjustmentRequestAdmin, voidBillingPayment, refundBillingPayment, confirmBillingPaymentAction,
  getClinicSettingsAdmin, updateClinicSettingsAdmin, getDiscountPresetsAdmin, saveDiscountPresetAdmin, getAuditLogs, getAuditArchiveBatches, getAuditArchiveDetail, archiveAuditLogs, deleteAuditArchive,
  getSystemSetup, saveBillingServiceCategory, deleteBillingServiceCategory, saveInventoryUom, deleteInventoryUom, saveInventorySupplier, saveInventoryLocationType, saveInventoryMovementReason, getInventoryLocationsAdmin, updateInventoryLocation, deleteInventoryLocation,
  getReports, recordReportExport, getInventoryLogs, getInventoryBatchHistory,
  getInventory, getInventoryMasterData, createInventoryLocation, createInventorySupplier, addInventoryItem, updateInventoryItem, deleteInventoryItem, updateStock, requestInventoryBatchActionCode, confirmInventoryBatchAction,
  getSupplyRequests, resolveSupplyRequest,
}
