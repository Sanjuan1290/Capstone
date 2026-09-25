// server/controllers/doctor.controller.js

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { issueSession, verifySessionToken } = require('../utils/sessionSecurity')
const { createNotification, notifyRoles } = require('../utils/notifications')
const { markOverdueAppointments } = require('../utils/appointments')
const { broadcast } = require('../utils/sse')
const { getTodayDateOnly } = require('../utils/date')
const {
  toDateOnly,
  isValidDateOnly,
  getDoctorUnavailableDates,
  getDoctorUnavailableDate,
  countActiveAppointmentsOnDate,
} = require('../utils/doctorAvailability')
const { loadImagesForConsultationIds, authorizeConsultationImages, syncConsultationImages } = require('../utils/consultationImages')
const { listBillingCatalog, getBillingByAppointmentId, upsertDraftBillingForAppointment, collectInventoryUsageFromBillingItems } = require('../utils/billing')
const { consumeInventoryFromLocationFEFO, getInventoryLocationById, attachBatchesToInventory } = require('../utils/inventoryBatches')
const { writeAuditLog } = require('../utils/audit')
const { saveDoctorScheduleDay } = require('../utils/doctorSchedule')
const { callNextQueuePatient, setQueueState, normalizeQueueStatus, assertQueueTransition } = require('../utils/queueWorkflow')
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition } = require('../utils/appointmentSecurity')
const {
  createClinicalUploadSignature,
  getPerceptionPointScanStatus,
  cloudinaryUploadBuffer,
  issueScanPendingToken,
  issueBypassAuthorizationToken,
  issueAcceptedUploadToken,
  verifyUploadSecurityToken,
  hashUploadBuffer,
} = require('../utils/cloudinarySecurity')
const { loadConsultationAmendments, assertConsultationEditable } = require('../utils/consultationIntegrity')
const { assertPlainObject, normalizeOptionalText, normalizeText } = require('../utils/inputValidation')

// ── Auth ──────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' })
  const [rows] = await db.query('SELECT * FROM doctors WHERE email = ? AND is_active = 1', [email])
  if (rows.length === 0) {
    await writeAuditLog({ userRole: 'doctor', action: 'auth.login_failed', entityType: 'doctor', newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  const doctor = rows[0]
  const match = await bcrypt.compare(password, doctor.password)
  if (!match) {
    await writeAuditLog({ userId: doctor.id, userRole: 'doctor', action: 'auth.login_failed', entityType: 'doctor', entityId: doctor.id, newValues: { reason: 'invalid_credentials' }, ipAddress: req.ip || null }).catch(() => {})
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  await issueSession(res, 'doctor', doctor.id)
  await writeAuditLog({ userId: doctor.id, userRole: 'doctor', action: 'auth.login_success', entityType: 'doctor', entityId: doctor.id, ipAddress: req.ip || null }).catch(() => {})
  res.status(200).json({
    message: 'Login successful.',
    user: { id: doctor.id, full_name: doctor.full_name, email: doctor.email, specialty: doctor.specialty, clinic_type: doctor.clinic_type, prc_license: doctor.prc_license, role: 'doctor', theme_preference: doctor.theme_preference, profile_image_url: doctor.profile_image_url, must_change_password: Boolean(doctor.must_change_password) },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['doctor_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = await verifySessionToken(token, 'doctor')
    const [rows] = await db.query(
      'SELECT id, full_name, email, specialty, clinic_type, prc_license, theme_preference, profile_image_url, must_change_password, password_changed_at FROM doctors WHERE id = ? AND is_active = 1', [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })
    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'doctor' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = async (req, res) => {
  await writeAuditLog({ userId: req.user?.id || null, userRole: 'doctor', action: 'auth.logout', entityType: 'doctor', entityId: req.user?.id || null, ipAddress: req.ip || null }).catch(() => {})
  res.clearCookie('doctor_token', { path: '/' })
  res.status(200).json({ message: 'Logged out.' })
}

const validateClinicalInventoryAvailability = async ({ billing, appointment }, conn) => {
  if (!billing?.id || !Array.isArray(billing.items)) return []
  const usage = collectInventoryUsageFromBillingItems(billing.items)
  const preferredLocation = appointment?.clinic_type === 'derma' ? 'Dermatology Room' : 'General Medicine Room'
  const checks = []
  for (const entry of usage) {
    const [[inventory]] = await conn.query(
      'SELECT id, name, unit, base_unit, unit_size FROM inventory WHERE id = ? LIMIT 1',
      [entry.inventory_id]
    )
    if (!inventory) continue
    const unitLabel = String(entry.unit_label || inventory.unit || '').toLowerCase()
    const baseUnit = String(inventory.base_unit || inventory.unit || '').toLowerCase()
    const packageUnit = String(inventory.unit || '').toLowerCase()
    const unitSize = Math.max(1, Number(inventory.unit_size) || 1)
    const requestedUsageQty = Number(entry.quantity || 0)
    const requestedPackages = unitLabel && baseUnit && unitLabel === baseUnit && baseUnit !== packageUnit
      ? requestedUsageQty / unitSize
      : requestedUsageQty
    const [[stock]] = await conn.query(
      `SELECT COALESCE(SUM(ilb.quantity),0) AS available_packages
       FROM inventory_location_batches ilb
       JOIN inventory_locations il ON il.id = ilb.location_id
       JOIN inventory_batches ib ON ib.id = ilb.batch_id
       WHERE ilb.inventory_id = ?
         AND il.name = ?
         AND ilb.quantity > 0 AND ib.quantity > 0
         AND ib.archived_at IS NULL
         AND (ib.expiration_date IS NULL OR ib.expiration_date >= CURDATE())`,
      [entry.inventory_id, preferredLocation]
    )
    const availablePackages = Number(stock?.available_packages || 0)
    const availableUsageQty = unitLabel && baseUnit && unitLabel === baseUnit && baseUnit !== packageUnit
      ? availablePackages * unitSize
      : availablePackages
    const sufficient = availablePackages + 0.0001 >= requestedPackages
    checks.push({ inventory_id: entry.inventory_id, name: inventory.name, requested: requestedUsageQty, available: availableUsageQty, unit: entry.unit_label || inventory.unit, sufficient })
    if (!sufficient) {
      throw Object.assign(
        new Error(`Insufficient stock in ${preferredLocation}. ${inventory.name} requires ${requestedUsageQty} ${entry.unit_label || inventory.unit || 'unit(s)'}, but only ${availableUsageQty} is available in this room. Request a stock transfer before completing this consultation.`),
        { statusCode: 409, code: 'CLINICAL_ROOM_STOCK_REQUIRED', inventory_id: entry.inventory_id, inventory_name: inventory.name, requested: requestedUsageQty, available: availableUsageQty, unit: entry.unit_label || inventory.unit || 'unit', location: preferredLocation }
      )
    }
  }
  return checks
}

const consumeClinicalInventory = async ({ billing, consultationId, doctorId, appointment }, conn) => {
  if (!billing?.id || billing.clinical_inventory_consumed_at || !Array.isArray(billing.items)) return
  const usage = collectInventoryUsageFromBillingItems(billing.items)
  const preferredLocation = appointment?.clinic_type === 'derma' ? 'Dermatology Room' : 'General Medicine Room'

  for (const entry of usage) {
    const [[inventory]] = await conn.query(
      'SELECT id, name, unit, base_unit, unit_size FROM inventory WHERE id = ? LIMIT 1',
      [entry.inventory_id]
    )
    if (!inventory) continue

    const unitLabel = String(entry.unit_label || inventory.unit || '').toLowerCase()
    const baseUnit = String(inventory.base_unit || inventory.unit || '').toLowerCase()
    const packageUnit = String(inventory.unit || '').toLowerCase()
    const unitSize = Math.max(1, Number(inventory.unit_size) || 1)
    const requestedUsageQty = Number(entry.quantity || 0)
    const packageQuantity = unitLabel && baseUnit && unitLabel === baseUnit && baseUnit !== packageUnit
      ? requestedUsageQty / unitSize
      : requestedUsageQty
    if (packageQuantity <= 0) continue

    // Clinical use may consume only stock that was transferred into the treatment
    // room. Main Stockroom is intentionally NOT a fallback; otherwise doctor stock
    // requests/approvals can be bypassed and location accountability becomes false.
    const consumption = await consumeInventoryFromLocationFEFO(
      entry.inventory_id,
      packageQuantity,
      preferredLocation,
      conn
    )
    if (!consumption.ok) throw Object.assign(
      new Error(`Insufficient stock in ${preferredLocation} for ${inventory.name}. Request a stock transfer before completing this consultation.`),
      { statusCode: 409, code: 'CLINICAL_ROOM_STOCK_REQUIRED', inventory_id: entry.inventory_id, location: preferredLocation }
    )

    const [usageResult] = await conn.query(
      `INSERT INTO consultation_inventory_usage
       (consultation_id, billing_id, inventory_id, quantity, unit_label, notes, recorded_by_doctor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         quantity = VALUES(quantity),
         unit_label = VALUES(unit_label),
         notes = VALUES(notes),
         recorded_by_doctor_id = VALUES(recorded_by_doctor_id)`,
      [consultationId, billing.id, entry.inventory_id, requestedUsageQty, entry.unit_label || inventory.unit, entry.labels?.join(', ') || null, doctorId]
    )
    const usageId = Number(usageResult.insertId)
    await conn.query('DELETE FROM consultation_inventory_usage_batches WHERE consultation_usage_id = ?', [usageId])

    let remainingUsageQty = requestedUsageQty
    for (const batch of consumption.consumed) {
      const batchUsageQty = unitLabel && baseUnit && unitLabel === baseUnit && baseUnit !== packageUnit
        ? Number(batch.quantity || 0) * unitSize
        : Number(batch.quantity || 0)
      const allocatedUsage = Math.min(remainingUsageQty, batchUsageQty)
      remainingUsageQty = Math.max(0, remainingUsageQty - allocatedUsage)
      const batchLabel = batch.batch_code || `Batch #${batch.batch_id}`

      await conn.query(
        `INSERT INTO consultation_inventory_usage_batches
         (consultation_usage_id, batch_id, package_quantity, usage_quantity, usage_unit_label, source_location, source_location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [usageId, batch.batch_id, Number(batch.quantity || 0), allocatedUsage, entry.unit_label || inventory.unit, batch.location || preferredLocation, batch.location_id || null]
      )
      await conn.query(
        `INSERT INTO inventory_logs
         (inventory_id, type, qty, note, movement_type, reference_type, reference_id, batch_id, from_location)
         VALUES (?, 'out', ?, ?, 'clinical_use', 'consultation', ?, ?, ?)`,
        [
          entry.inventory_id,
          Number(batch.quantity || 0),
          `Clinical use from ${batchLabel}: ${allocatedUsage} ${entry.unit_label || inventory.unit}${entry.labels?.length ? ` — ${entry.labels.join(', ')}` : ''}`,
          consultationId,
          batch.batch_id,
          batch.location || preferredLocation,
        ]
      )
    }
  }

  await conn.query('UPDATE billing_records SET clinical_inventory_consumed_at = NOW() WHERE id = ?', [billing.id])
  billing.clinical_inventory_consumed_at = new Date()
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  const today = getTodayDateOnly()
  const [[{ totalToday }]]      = await db.query(
    'SELECT COUNT(*) AS totalToday FROM appointments WHERE doctor_id = ? AND appointment_date = ?',
    [req.user.id, today]
  )
  const [[{ completed }]]       = await db.query(
    "SELECT COUNT(*) AS completed FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = 'completed'",
    [req.user.id, today]
  )
  const [[{ remainingToday }]]  = await db.query(
    "SELECT COUNT(*) AS remainingToday FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status IN ('confirmed','rescheduled','in-progress')",
    [req.user.id, today]
  )
  const [[{ upcomingCount }]]   = await db.query(
    "SELECT COUNT(*) AS upcomingCount FROM appointments WHERE doctor_id = ? AND appointment_date > ? AND status IN ('confirmed','rescheduled')",
    [req.user.id, today]
  )
  const [[{ pending }]]         = await db.query(
    "SELECT COUNT(*) AS pending FROM appointments WHERE doctor_id = ? AND status = 'confirmed'",
    [req.user.id]
  )
  const [[{ pendingRequests }]] = await db.query(
    "SELECT COUNT(*) AS pendingRequests FROM supply_requests WHERE doctor_id = ? AND status = 'pending'",
    [req.user.id]
  )
  const [walkInQueue] = await db.query(
    `SELECT q.id, q.queue_number AS queueNo, q.patient_name AS patient,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt, q.type, q.status
     FROM queue q
     WHERE q.doctor_id = ? AND q.queue_date = ? AND q.status IN ('waiting','called','in_consultation')
     ORDER BY q.queue_number ASC`,
    [req.user.id, today]
  )
  const [schedule] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  const [upcomingAppointments] = await db.query(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date, a.appointment_time,
            a.clinic_type, a.reason, a.status, a.appointment_source,
            p.full_name AS patient_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appointment_date > ?
       AND a.status IN ('confirmed','rescheduled')
     ORDER BY a.appointment_date ASC, a.appointment_time ASC
     LIMIT 8`,
    [req.user.id, today]
  )
  res.json({ totalToday, completed, remainingToday, upcomingCount, pending, pendingRequests, schedule, walkInQueue, upcomingAppointments })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getAppointments = async (req, res) => {
  const today = getTodayDateOnly()
  const scope = String(req.query.scope || 'today').trim().toLowerCase()
  const requestedDate = String(req.query.date || '').trim()

  let dateClause = 'a.appointment_date = ?'
  let dateParams = [requestedDate || today]
  let statuses = ['confirmed', 'in-progress', 'completed', 'rescheduled']
  let orderDirection = 'ASC'

  if (scope === 'upcoming') {
    dateClause = 'a.appointment_date > ?'
    dateParams = [today]
    statuses = ['confirmed', 'rescheduled']
  } else if (scope === 'history') {
    dateClause = 'a.appointment_date <= ?'
    dateParams = [today]
    statuses = ['completed']
    orderDirection = 'DESC'
  } else if (scope !== 'today' && scope !== 'date') {
    return res.status(400).json({ message: 'Unsupported appointment scope.' })
  }

  if ((scope === 'date' || requestedDate) && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return res.status(400).json({ message: 'A valid appointment date is required.' })
  }

  const placeholders = statuses.map(() => '?').join(',')
  const [rows] = await db.query(
    `SELECT a.*, a.appointment_time AS time, a.clinic_type AS type,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            p.full_name AS patient_name, p.full_name AS patient,
            p.birthdate, p.sex AS patient_sex, p.phone AS patient_phone,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age,
            c.id AS consultation_id, c.status AS consultation_status,
            c.finalized_at AS consultation_finalized_at
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     LEFT JOIN consultations c ON c.appointment_id = a.id AND c.doctor_id = a.doctor_id
     WHERE a.doctor_id = ?
       AND ${dateClause}
       AND a.status IN (${placeholders})
     ORDER BY a.appointment_date ${orderDirection}, STR_TO_DATE(a.appointment_time, '%h:%i %p') ${orderDirection}
     LIMIT 300`,
    [req.user.id, ...dateParams, ...statuses]
  )

  const imagesByConsultationId = await loadImagesForConsultationIds(rows.map((row) => row.consultation_id))
  res.json(rows.map((row) => ({
    ...row,
    progress_images: imagesByConsultationId[row.consultation_id] || [],
  })))
}

const getDailyAppointments = async (req, res) => {
  const date = req.query.date || getTodayDateOnly()
  const [rows] = await db.query(
    `SELECT a.*, a.appointment_time AS time, a.clinic_type AS type,
            p.full_name AS patient_name, p.full_name AS patient,
            p.birthdate, p.sex AS patient_sex, p.phone AS patient_phone,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age
     FROM appointments a JOIN patients p ON a.patient_id = p.id
     WHERE a.doctor_id = ? AND a.appointment_date = ?
       AND a.status IN ('confirmed','in-progress','completed','rescheduled')
     ORDER BY a.appointment_time ASC`,
    [req.user.id, date]
  )
  const imagesByConsultationId = await loadImagesForConsultationIds(rows.map((row) => row.consultation_id))
  res.json(rows.map((row) => ({
    ...row,
    progress_images: imagesByConsultationId[row.consultation_id] || [],
  })))
}

const startConsultation = async (req, res) => {
  const conn = await db.getConnection()
  let appointment
  let queueEntry = null
  let queuePreviousStatus = null

  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT id, patient_id, doctor_id, status, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date
       FROM appointments
       WHERE id = ? AND doctor_id = ?
       FOR UPDATE`,
      [req.params.id, req.user.id]
    )
    if (rows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Appointment not found.' })
    }
    appointment = rows[0]
    if (String(appointment.appointment_date || '').slice(0, 10) !== getTodayDateOnly()) {
      await conn.rollback()
      return res.status(409).json({ code: 'APPOINTMENT_NOT_TODAY', message: 'Consultations can only be started on the appointment date.' })
    }

    // If this appointment has a queue row, Staff/Admin must call the patient first.
    // Lock the queue row in the SAME transaction as the appointment so the two
    // state machines cannot diverge if one update fails.
    const [queueRows] = await conn.query(
      `SELECT id, status, patient_id, doctor_id, queue_number, appointment_id
       FROM queue
       WHERE appointment_id = ? AND doctor_id = ? AND queue_date = ?
         AND status IN ('waiting','called','in-progress','in_consultation')
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [req.params.id, req.user.id, getTodayDateOnly()]
    )

    if (queueRows[0]) {
      queuePreviousStatus = normalizeQueueStatus(queueRows[0].status)
      if (queuePreviousStatus === 'waiting') {
        await conn.rollback()
        return res.status(409).json({
          code: 'PATIENT_NOT_CALLED',
          message: 'Call the patient from the queue before starting the consultation.',
        })
      }
      if (!['called', 'in_consultation'].includes(queuePreviousStatus)) {
        await conn.rollback()
        return res.status(409).json({ code: 'QUEUE_NOT_READY', message: 'The patient queue entry is not ready for consultation.' })
      }

      if (queuePreviousStatus === 'called') {
        assertQueueTransition('called', 'in_consultation')
        await conn.query(
          "UPDATE queue SET status='in_consultation', consultation_started_at=COALESCE(consultation_started_at, NOW()) WHERE id = ?",
          [queueRows[0].id]
        )
        await writeAuditLog({
          userId: req.user.id,
          userRole: 'doctor',
          action: 'queue.in_consultation',
          entityType: 'queue',
          entityId: queueRows[0].id,
          oldValues: { status: 'called' },
          newValues: { status: 'in_consultation', appointment_id: Number(req.params.id) },
          ipAddress: req.ip || null,
        }, conn)
      }
      queueEntry = { ...queueRows[0], status: 'in_consultation' }
    }

    if (appointment.status !== 'in-progress') {
      assertAppointmentTransition(appointment.status, 'in-progress')
      await conn.query("UPDATE appointments SET status = 'in-progress' WHERE id = ?", [req.params.id])
      await writeAuditLog({
        userId: req.user.id,
        userRole: 'doctor',
        action: 'appointment.consultation_started',
        entityType: 'appointment',
        entityId: req.params.id,
        oldValues: { status: appointment.status },
        newValues: { status: 'in-progress' },
        ipAddress: req.ip || null,
      }, conn)
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message, code: error.code || undefined })
    throw error
  } finally {
    conn.release()
  }

  if (queueEntry && queuePreviousStatus === 'called') {
    broadcast(['admin', 'staff', `doctor_${req.user.id}`, ...(queueEntry.patient_id ? [`patient_${queueEntry.patient_id}`] : [])], 'queue_updated', {
      queueId: Number(queueEntry.id),
      status: 'in_consultation',
      doctorId: req.user.id,
      appointmentId: Number(req.params.id),
    })
  }

  broadcast(['admin', 'staff', `patient_${appointment.patient_id}`], 'appointment_updated', {
    appointmentId: Number(req.params.id),
    status: 'in-progress',
  })
  res.json({ message: 'Consultation started.', queue: queueEntry })
}

const normalizeConsultationTextFields = (body) => {
  assertPlainObject(body)
  const diagnosis = normalizeOptionalText(body.diagnosis, { field: 'Diagnosis', max: 5000, multiline: true })
  const prescription = normalizeOptionalText(body.prescription, { field: 'Prescription', max: 20000, multiline: true })
  const notes = normalizeOptionalText(body.notes, { field: 'Clinical Notes', max: 5000, multiline: true })
  if (prescription) {
    let parsed
    try { parsed = JSON.parse(prescription) } catch { throw Object.assign(new Error('Prescription data is invalid.'), { statusCode: 400, code: 'VALIDATION_ERROR', publicMessage: 'Prescription data is invalid.' }) }
    if (!Array.isArray(parsed)) throw Object.assign(new Error('Prescription data must be a list.'), { statusCode: 400, code: 'VALIDATION_ERROR', publicMessage: 'Prescription data must be a list.' })
    if (parsed.length > 30) throw Object.assign(new Error('A consultation can contain at most 30 prescription items.'), { statusCode: 400, code: 'VALIDATION_ERROR', publicMessage: 'A consultation can contain at most 30 prescription items.' })
  }
  return { diagnosis, prescription, notes }
}

const buildConsultationPayload = (req) => ({
  ...normalizeConsultationTextFields(req.body),
  images: Object.prototype.hasOwnProperty.call(req.body, 'images') ? req.body.images : null,
  billableServices: Object.prototype.hasOwnProperty.call(req.body, 'billable_services') ? req.body.billable_services : null,
})

const saveConsultationDraft = async (req, res) => {
  const { appointmentId } = req.params
  const payload = buildConsultationPayload(req)
  const conn = await db.getConnection()
  let consultationId
  let billing = null
  let appt

  try {
    await conn.beginTransaction()
    const [apptRows] = await conn.query(
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ? FOR UPDATE',
      [appointmentId, req.user.id]
    )
    if (apptRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Appointment not found.' })
    }
    appt = apptRows[0]
    if (!['confirmed', 'rescheduled', 'in-progress'].includes(String(appt.status || ''))) {
      await conn.rollback()
      return res.status(409).json({ code: 'CONSULTATION_NOT_EDITABLE', message: 'This appointment is not in an editable consultation state.' })
    }

    const [existing] = await conn.query(
      'SELECT id, status, version FROM consultations WHERE appointment_id = ? FOR UPDATE',
      [appointmentId]
    )
    if (existing[0] && String(existing[0].status || 'draft') === 'finalized') {
      await conn.rollback()
      return res.status(409).json({ code: 'CONSULTATION_FINALIZED', message: 'This consultation is already finalized. Add an amendment instead.' })
    }

    if (existing[0]) {
      consultationId = existing[0].id
      await conn.query(
        `UPDATE consultations
         SET diagnosis=?, prescription=?, notes=?, status='draft', updated_at=NOW(), version=COALESCE(version,1)+1
         WHERE id=?`,
        [payload.diagnosis, payload.prescription, payload.notes, consultationId]
      )
    } else {
      const [inserted] = await conn.query(
        `INSERT INTO consultations
         (appointment_id, doctor_id, patient_id, diagnosis, prescription, notes, status, updated_at, version)
         VALUES (?,?,?,?,?,?,'draft',NOW(),1)`,
        [appointmentId, req.user.id, appt.patient_id, payload.diagnosis, payload.prescription, payload.notes]
      )
      consultationId = inserted.insertId
    }

    if (payload.images !== null) {
      const authorizedImages = await authorizeConsultationImages({ consultationId, appointmentId, doctorId: req.user.id, images: payload.images, executor: conn })
      await syncConsultationImages(consultationId, authorizedImages, conn)
    }
    if (payload.billableServices !== null) {
      billing = await upsertDraftBillingForAppointment({ appointment: appt, consultationId, items: payload.billableServices }, conn)
    } else {
      billing = await getBillingByAppointmentId(appointmentId, conn)
    }
    await validateClinicalInventoryAvailability({ billing, appointment: appt }, conn)

    await writeAuditLog({
      userId: req.user.id,
      userRole: 'doctor',
      action: 'clinical.consultation_draft_saved',
      entityType: 'consultation',
      entityId: consultationId,
      newValues: { appointment_id: Number(appointmentId), status: 'draft' },
      ipAddress: req.ip || null,
    }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }

  broadcast([`doctor_${req.user.id}`], 'consultation_draft_saved', {
    appointmentId: Number(appointmentId), consultationId,
  })
  res.json({ message: 'Draft saved.', consultation_id: consultationId, status: 'draft', billing })
}

const finalizeConsultation = async (req, res) => {
  const { diagnosis, prescription, notes } = normalizeConsultationTextFields(req.body)
  const hasImagesPayload = Object.prototype.hasOwnProperty.call(req.body, 'images')
  const hasBillableServicesPayload = Object.prototype.hasOwnProperty.call(req.body, 'billable_services')
  const images = hasImagesPayload ? req.body.images : []
  const billableServices = hasBillableServicesPayload ? req.body.billable_services : []
  const { appointmentId } = req.params
  const conn = await db.getConnection()
  let appt
  let consultationId = null
  let queueId = null
  let billing = null

  try {
    await conn.beginTransaction()

    const [apptRows] = await conn.query(
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ? FOR UPDATE',
      [appointmentId, req.user.id]
    )
    if (apptRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Appointment not found.' })
    }

    appt = apptRows[0]
    assertAppointmentTransition(appt.status, 'completed')

    const [activeQueueRows] = await conn.query(
      `SELECT id, status, patient_id, doctor_id, appointment_id
       FROM queue
       WHERE appointment_id = ? AND doctor_id = ? AND queue_date = ?
         AND status IN ('waiting','called','in-progress','in_consultation')
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [appointmentId, req.user.id, getTodayDateOnly()]
    )
    if (activeQueueRows[0]) {
      const queueStatus = normalizeQueueStatus(activeQueueRows[0].status)
      if (queueStatus !== 'in_consultation') {
        await conn.rollback()
        return res.status(409).json({
          code: 'QUEUE_CONSULTATION_NOT_STARTED',
          message: 'Start the patient consultation before completing the visit.',
        })
      }
      queueId = activeQueueRows[0].id
    }

    const [existing] = await conn.query(
      'SELECT id, status FROM consultations WHERE appointment_id = ? FOR UPDATE',
      [appointmentId]
    )

    if (existing.length > 0) {
      if (String(existing[0].status || 'draft') === 'finalized') {
        await conn.rollback()
        return res.status(409).json({ code: 'CONSULTATION_FINALIZED', message: 'This consultation is already finalized. Add an amendment instead.' })
      }
      consultationId = existing[0].id
      await conn.query(
        'UPDATE consultations SET diagnosis = ?, prescription = ?, notes = ?, updated_at = NOW() WHERE id = ?',
        [diagnosis || null, prescription || null, notes || null, consultationId]
      )
    } else {
      const [result] = await conn.query(
        "INSERT INTO consultations (appointment_id, doctor_id, patient_id, diagnosis, prescription, notes, status, updated_at) VALUES (?,?,?,?,?,?,'draft',NOW())",
        [appointmentId, req.user.id, appt.patient_id, diagnosis || null, prescription || null, notes || null]
      )
      consultationId = result.insertId
    }

    if (hasImagesPayload) {
      const authorizedImages = await authorizeConsultationImages({ consultationId, appointmentId, doctorId: req.user.id, images, executor: conn })
      await syncConsultationImages(consultationId, authorizedImages, conn)
    }
    billing = await upsertDraftBillingForAppointment({
      appointment: appt,
      consultationId,
      items: billableServices,
    }, conn)
    await validateClinicalInventoryAvailability({ billing, appointment: appt }, conn)
    await consumeClinicalInventory({ billing, consultationId, doctorId: req.user.id, appointment: appt }, conn)

    await conn.query(
      `UPDATE consultations
       SET status='finalized', finalized_at=NOW(), finalized_by_doctor_id=?, updated_at=NOW()
       WHERE id=?`,
      [req.user.id, consultationId]
    )
    await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointmentId])
    await writeAuditLog({
      userId: req.user.id, userRole: 'doctor', action: 'clinical.consultation_finalized', entityType: 'consultation', entityId: consultationId,
      newValues: { appointment_id: Number(appointmentId), services_count: Array.isArray(billableServices) ? billableServices.length : 0, status: 'finalized' },
      ipAddress: req.ip || null,
    }, conn)

    if (queueId) {
      await conn.query(
        "UPDATE queue SET status='done', completed_at=COALESCE(completed_at, NOW()) WHERE id = ?",
        [queueId]
      )
      await writeAuditLog({
        userId: req.user.id,
        userRole: 'doctor',
        action: 'queue.done',
        entityType: 'queue',
        entityId: queueId,
        oldValues: { status: 'in_consultation' },
        newValues: { status: 'done', appointment_id: Number(appointmentId) },
        ipAddress: req.ip || null,
      }, conn)
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message, code: err.code || undefined, inventory_id: err.inventory_id, inventory_name: err.inventory_name, requested: err.requested, available: err.available, unit: err.unit, location: err.location })
    throw err
  } finally {
    conn.release()
  }

  if (queueId) {
    broadcast(['admin', 'staff', `doctor_${req.user.id}`], 'queue_updated', {
      queueId,
      status: 'done',
      doctorId: req.user.id,
    })
  }

  broadcast(['admin', 'staff', `patient_${appt.patient_id}`], 'appointment_updated', {
    appointmentId: Number(appointmentId),
    status: 'completed',
  })
  broadcast(['admin', 'staff', `patient_${appt.patient_id}`, `doctor_${req.user.id}`], 'consultation_saved', {
    appointmentId: Number(appointmentId),
    patientId: appt.patient_id,
    doctorId: req.user.id,
  })
  if (billing?.id) {
    await Promise.all([
      createNotification({
        target_role: 'staff',
        type: 'billing_ready_for_review',
        title: 'Bill ready for review',
        message: `Consultation completed. Billing #${billing.id} is ready for review and checkout.`,
        reference_type: 'billing_record',
        reference_id: billing.id,
        link: `/staff/checkout/${billing.id}`,
      }),
      createNotification({
        target_role: 'admin',
        type: 'billing_ready_for_review',
        title: 'Bill ready for review',
        message: `Consultation completed. Billing #${billing.id} is ready for review and checkout.`,
        reference_type: 'billing_record',
        reference_id: billing.id,
        link: `/admin/checkout/${billing.id}`,
      }),
    ]).catch(() => {})
  }
  res.json({ message: 'Consultation completed.', consultation_id: consultationId, status: 'finalized', billing })
}

// ── NEW: Get a single consultation (for viewing/editing after completion) ─────
const getConsultation = async (req, res) => {
  const { appointmentId } = req.params
  const [rows] = await db.query(
    `SELECT c.*, a.clinic_type AS type, a.reason, a.appointment_time AS time,
            a.requested_service_id, a.requested_service_name_snapshot, a.requested_service_price_snapshot,
            p.full_name AS patient_name,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age,
            p.sex AS patient_sex, p.phone AS patient_phone
     FROM consultations c
     JOIN appointments a ON c.appointment_id = a.id
     JOIN patients p ON c.patient_id = p.id
     WHERE c.appointment_id = ? AND c.doctor_id = ?`,
    [appointmentId, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Consultation not found.' })
  const consultation = rows[0]
  const imagesByConsultationId = await loadImagesForConsultationIds([consultation.id])
  const amendmentsByConsultationId = await loadConsultationAmendments([consultation.id])
  const billing = await getBillingByAppointmentId(appointmentId)
  await writeAuditLog({
    userId: req.user.id, userRole: 'doctor', action: 'clinical.consultation_viewed',
    entityType: 'consultation', entityId: consultation.id, ipAddress: req.ip || null,
  }).catch(() => {})
  res.json({
    ...consultation,
    progress_images: imagesByConsultationId[consultation.id] || [],
    amendments: amendmentsByConsultationId[consultation.id] || [],
    billing,
  })
}

// ── NEW: Update (edit) a completed consultation ───────────────────────────────
const updateConsultation = async (req, res) => {
  const { appointmentId } = req.params
  const { diagnosis, prescription, notes } = normalizeConsultationTextFields(req.body)
  const hasImagesPayload = Object.prototype.hasOwnProperty.call(req.body, 'images')
  const hasBillableServicesPayload = Object.prototype.hasOwnProperty.call(req.body, 'billable_services')
  const conn = await db.getConnection()
  let patientId = null
  let billing = null

  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT c.id, c.patient_id, c.status, a.id AS appointment_id, a.patient_id AS appointment_patient_id
       FROM consultations c
       JOIN appointments a ON a.id = c.appointment_id
       WHERE c.appointment_id = ? AND c.doctor_id = ?`,
      [appointmentId, req.user.id]
    )
    if (rows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Consultation not found.' })
    }

    const consultation = rows[0]
    assertConsultationEditable(consultation)
    patientId = consultation.appointment_patient_id || consultation.patient_id

    await conn.query(
      'UPDATE consultations SET diagnosis = ?, prescription = ?, notes = ?, updated_at = NOW() WHERE id = ?',
      [diagnosis || null, prescription || null, notes || null, consultation.id]
    )
    if (hasImagesPayload) {
      const authorizedImages = await authorizeConsultationImages({ consultationId: consultation.id, appointmentId, doctorId: req.user.id, images: req.body.images, executor: conn })
      await syncConsultationImages(consultation.id, authorizedImages, conn)
    }

    const [apptRows] = await conn.query(
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ? LIMIT 1',
      [appointmentId, req.user.id]
    )
    if (hasBillableServicesPayload) {
      billing = await upsertDraftBillingForAppointment({
        appointment: apptRows[0],
        consultationId: consultation.id,
        items: req.body.billable_services,
      }, conn)
    } else {
      billing = await getBillingByAppointmentId(appointmentId, conn)
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  broadcast(['admin', 'staff', `patient_${patientId}`, `doctor_${req.user.id}`], 'consultation_saved', {
    appointmentId: Number(appointmentId),
    doctorId: req.user.id,
    patientId,
    updated: true,
  })
  res.json({ message: 'Consultation updated.', billing })
}

const addConsultationAmendment = async (req, res) => {
  const appointmentId = Number(req.params.appointmentId)
  assertPlainObject(req.body)
  const reason = normalizeText(req.body.reason, { field: 'Amendment Reason', required: true, max: 255, multiline: true })
  const amendmentText = normalizeText(req.body.amendment_text, { field: 'Amendment Text', required: true, max: 5000, multiline: true })
  if (!appointmentId) {
    return res.status(400).json({ message: 'A valid appointment is required.' })
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT c.id, c.patient_id, c.status
       FROM consultations c
       WHERE c.appointment_id = ? AND c.doctor_id = ?
       FOR UPDATE`,
      [appointmentId, req.user.id]
    )
    if (!rows.length) {
      await conn.rollback()
      return res.status(404).json({ message: 'Consultation not found.' })
    }
    if (String(rows[0].status) !== 'finalized') {
      await conn.rollback()
      return res.status(409).json({ message: 'Only finalized consultations require amendments.' })
    }

    const [result] = await conn.query(
      `INSERT INTO consultation_amendments (consultation_id, doctor_id, reason, amendment_text)
       VALUES (?,?,?,?)`,
      [rows[0].id, req.user.id, reason, amendmentText]
    )
    await writeAuditLog({
      userId: req.user.id, userRole: 'doctor', action: 'clinical.consultation_amended',
      entityType: 'consultation', entityId: rows[0].id,
      newValues: { amendment_id: result.insertId, reason }, ipAddress: req.ip || null,
    }, conn)
    await conn.commit()

    const amendmentsByConsultationId = await loadConsultationAmendments([rows[0].id])
    broadcast(['admin', `doctor_${req.user.id}`, `patient_${rows[0].patient_id}`], 'consultation_saved', {
      appointmentId, patientId: rows[0].patient_id, doctorId: req.user.id, amended: true,
    })
    return res.status(201).json({ message: 'Amendment added.', amendments: amendmentsByConsultationId[rows[0].id] || [] })
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

// ── Patient History ───────────────────────────────────────────────────────────

const getPatientHistory = async (req, res) => {
  const patientId = Number(req.params.id)
  if (!patientId) return res.status(400).json({ message: 'A valid patient is required.' })

  // Object-level authorization: a doctor may open a patient history only when the
  // clinic has an appointment relationship between that doctor and patient.
  const [relationship] = await db.query(
    `SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1`,
    [patientId, req.user.id]
  )
  if (!relationship.length) {
    await writeAuditLog({
      userId: req.user.id, userRole: 'doctor', action: 'security.patient_history_access_denied',
      entityType: 'patient', entityId: patientId, ipAddress: req.ip || null,
    }).catch(() => {})
    return res.status(403).json({ message: 'You are not authorized to view this patient record.' })
  }

  const [rows] = await db.query(
    `SELECT a.*, a.appointment_date AS date, a.appointment_time AS time,
            a.clinic_type AS type, c.id AS consultation_id, c.diagnosis, c.prescription,
            c.notes, c.notes AS consultation_notes, c.consulted_at
     FROM appointments a LEFT JOIN consultations c ON c.appointment_id = a.id
     WHERE a.patient_id = ? AND a.doctor_id = ? AND a.status IN ('completed','cancelled','no_show')
     ORDER BY a.appointment_date DESC`,
    [patientId, req.user.id]
  )
  const consultationIds = rows.map((row) => row.consultation_id)
  const imagesByConsultationId = await loadImagesForConsultationIds(consultationIds)
  const amendmentsByConsultationId = await loadConsultationAmendments(consultationIds)
  await writeAuditLog({
    userId: req.user.id, userRole: 'doctor', action: 'clinical.patient_history_viewed',
    entityType: 'patient', entityId: patientId, ipAddress: req.ip || null,
  }).catch(() => {})
  res.json(rows.map((row) => ({ ...row, progress_images: imagesByConsultationId[row.consultation_id] || [], amendments: amendmentsByConsultationId[row.consultation_id] || [] })))
}

const getClinicalUploadAppointment = async (appointmentId, doctorId) => {
  const [rows] = await db.query(
    `SELECT id, patient_id, clinic_type FROM appointments WHERE id = ? AND doctor_id = ? LIMIT 1`,
    [appointmentId, doctorId]
  )
  return rows[0] || null
}

const uploadClinicalImage = async (req, res) => {
  const appointmentId = Number(req.query?.appointment_id)
  const scanMode = String(req.query?.scan_mode || 'scan').trim().toLowerCase() === 'bypass' ? 'bypass' : 'scan'
  if (!appointmentId) return res.status(400).json({ message: 'A valid appointment is required.' })
  const uploadAppointment = await getClinicalUploadAppointment(appointmentId, req.user.id)
  if (!uploadAppointment) {
    return res.status(403).json({ message: 'You are not authorized to upload images for this appointment.' })
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: 'Select a clinical image to upload.' })
  }
  const fileHash = hashUploadBuffer(req.body)

  let bypassReason = null
  if (scanMode === 'bypass') {
    try {
      const bypass = verifyUploadSecurityToken(String(req.query?.bypass_token || ''), {
        stage: 'bypass_authorized',
        role: 'doctor',
        user_id: req.user.id,
        context_type: 'clinical',
        context_id: appointmentId,
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
    const signed = createClinicalUploadSignature({ doctorId: req.user.id, appointmentId, patientId: uploadAppointment.patient_id, clinicType: uploadAppointment.clinic_type, scanMode })
    uploaded = await cloudinaryUploadBuffer({
      buffer: req.body,
      mimeType: req.get('content-type'),
      fileName: req.get('x-file-name') || 'clinical-image',
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
          : 'The malware scanner is currently unavailable. Only continue if this clinical image comes from a trusted source.',
        bypass_token: issueBypassAuthorizationToken({ role: 'doctor', userId: req.user.id, contextType: 'clinical', contextId: appointmentId, reason, fileHash }),
      })
    }
    return res.status(error.statusCode || 502).json({ message: error.message || 'Clinical image upload failed.', code: error.code || 'CLINICAL_IMAGE_UPLOAD_FAILED' })
  }

  if (scanMode === 'bypass') {
    const securityToken = issueAcceptedUploadToken({
      role: 'doctor', userId: req.user.id, contextType: 'clinical', contextId: appointmentId,
      status: 'bypassed', assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id,
    })
    await writeAuditLog({
      userId: req.user.id,
      userRole: 'doctor',
      action: 'security.clinical_upload_scan_bypassed',
      entityType: 'appointment',
      entityId: appointmentId,
      newValues: { scan_status: 'bypassed', reason: bypassReason, asset_id: uploaded.asset_id },
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
      role: 'doctor', userId: req.user.id, contextType: 'clinical', contextId: appointmentId,
      assetId: uploaded.asset_id, url: uploaded.secure_url, publicId: uploaded.public_id, fileHash,
    }),
  })
}

const getClinicalUploadScanStatus = async (req, res) => {
  const appointmentId = Number(req.body?.appointment_id)
  const assetId = String(req.body?.asset_id || '').trim()
  const scanToken = String(req.body?.scan_token || '').trim()
  if (!appointmentId || !assetId || !scanToken) {
    return res.status(400).json({ message: 'Appointment, Cloudinary asset ID, and scan verification are required.' })
  }
  const uploadAppointment = await getClinicalUploadAppointment(appointmentId, req.user.id)
  if (!uploadAppointment) {
    return res.status(403).json({ message: 'You are not authorized to check this clinical image.' })
  }

  let pending
  try {
    pending = verifyUploadSecurityToken(scanToken, {
      stage: 'scan_pending',
      role: 'doctor',
      user_id: req.user.id,
      context_type: 'clinical',
      context_id: appointmentId,
      asset_id: assetId,
    })
  } catch (error) {
    return res.status(error.statusCode || 403).json({ message: error.message || 'The scan verification is invalid.' })
  }

  const unavailable = (reason, message) => res.json({
    status: 'unavailable',
    reason,
    message,
    bypass_token: issueBypassAuthorizationToken({ role: 'doctor', userId: req.user.id, contextType: 'clinical', contextId: appointmentId, reason, fileHash: pending.file_sha256 }),
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
          role: 'doctor', userId: req.user.id, contextType: 'clinical', contextId: appointmentId,
          status: 'approved', assetId, url: result.secure_url || pending.url, publicId: result.public_id || pending.public_id,
        }),
      })
    }
    if (result.status === 'rejected') {
      await writeAuditLog({
        userId: req.user.id,
        userRole: 'doctor',
        action: 'security.clinical_upload_blocked',
        entityType: 'appointment',
        entityId: appointmentId,
        newValues: { scan_status: 'rejected', provider: 'perception_point', asset_id: assetId },
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
        : 'The malware scanner status is currently unavailable. Only continue if this clinical image comes from a trusted source.')
    }
    return res.status(error.statusCode || 500).json({ message: error.message || 'Could not check the security scan.' })
  }
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getBillingCatalog = async (req, res) => {
  const rows = await listBillingCatalog({
    clinicType: String(req.query.clinic_type || '').trim() || undefined,
  })
  res.json(rows)
}

const getInventoryItems = async (req, res) => {
  const [[doctor]] = await db.query('SELECT clinic_type FROM doctors WHERE id=? LIMIT 1', [req.user.id])
  const treatmentLocation = doctor?.clinic_type === 'derma' ? 'Dermatology Room' : 'General Medicine Room'
  const [rows] = await db.query(
    `SELECT i.id, i.name, i.category, COALESCE(i.item_type, 'medicine') AS item_type,
            COALESCE(i.uom, i.base_unit, i.unit, 'piece') AS uom,
            COALESCE(i.uom, i.base_unit, i.unit, 'piece') AS unit,
            i.dosage_form, i.strength, i.stock, i.stock_base, i.threshold, i.selling_price,
            COALESCE(u.allow_decimal_quantity,0) AS uom_allow_decimal,
            COALESCE(u.decimal_precision,0) AS uom_decimal_precision,
            COALESCE((SELECT SUM(ils.quantity)
                      FROM inventory_location_stock ils
                      JOIN inventory_locations il ON il.id=ils.location_id
                      WHERE ils.inventory_id=i.id AND il.name='Main Stockroom'),0) AS main_stockroom_stock,
            COALESCE((SELECT SUM(ils.quantity)
                      FROM inventory_location_stock ils
                      JOIN inventory_locations il ON il.id=ils.location_id
                      WHERE ils.inventory_id=i.id AND il.name=?),0) AS treatment_room_stock,
            ? AS treatment_room_name
     FROM inventory i
     LEFT JOIN inventory_uoms u ON LOWER(u.name)=LOWER(COALESCE(i.uom,i.base_unit,i.unit,''))
     WHERE i.stock > 0 AND i.archived_at IS NULL
     ORDER BY i.category, i.name`,
    [treatmentLocation, treatmentLocation]
  )
  const withBatches = await attachBatchesToInventory(rows, db)
  const today = new Date().toISOString().slice(0, 10)
  res.json(withBatches.map((item) => ({
    ...item,
    treatment_room_batches: (Array.isArray(item.batches) ? item.batches : [])
      .filter((batch) => !batch.archived_at && Number(batch.quantity || 0) > 0 && (!batch.expiration_date || String(batch.expiration_date).slice(0, 10) >= today))
      .flatMap((batch) => (Array.isArray(batch.locations) ? batch.locations : [])
        .filter((location) => location.name === treatmentLocation && Number(location.quantity || 0) > 0)
        .map((location) => ({
          batch_id: Number(batch.id),
          batch_code: batch.batch_code || `Batch #${batch.id}`,
          expiration_date: batch.expiration_date || null,
          available: Math.min(Number(batch.quantity || 0), Number(location.quantity || 0)),
          location_id: Number(location.id || 0) || null,
          location: location.name,
        }))),
    batches: undefined,
  })))
}

// ── Supply Requests ───────────────────────────────────────────────────────────

const getMyRequests = async (req, res) => {
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.unit, i.category,
            COALESCE(loc.name, sr.destination_location) AS destination_location
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     LEFT JOIN inventory_locations loc ON loc.id = sr.destination_location_id
     WHERE sr.doctor_id = ? ORDER BY sr.requested_at DESC`,
    [req.user.id]
  )
  res.json(rows)
}

const getRequestLocations = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, name, location_type
     FROM inventory_locations
     WHERE COALESCE(is_active,1)=1 AND location_type IN ('room','dispensing')
     ORDER BY FIELD(location_type,'room','dispensing'), name`
  )
  res.json(rows)
}

const submitRequest = async (req, res) => {
  const { inventory_id, qty_requested, reason } = req.body
  const quantity = Number(qty_requested)
  if (!Number(inventory_id) || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Inventory item and a positive quantity are required.' })
  }

  let destination = await getInventoryLocationById(req.body.destination_location_id)
  if (!destination) {
    const [[doctorRow]] = await db.query('SELECT specialty, clinic_type FROM doctors WHERE id = ? LIMIT 1', [req.user.id])
    const defaultDestination = (doctorRow?.clinic_type || (String(doctorRow?.specialty || '').toLowerCase().includes('derm') ? 'derma' : 'medical')) === 'derma' ? 'Dermatology Room' : 'General Medicine Room'
    const [[defaultRow]] = await db.query(
      `SELECT id, name, location_type FROM inventory_locations
       WHERE name = ? AND COALESCE(is_active,1)=1 LIMIT 1`,
      [defaultDestination]
    )
    destination = defaultRow || null
  }
  if (!destination || !['room','dispensing'].includes(String(destination.location_type))) {
    return res.status(400).json({ message: 'Select a valid treatment or dispensing destination.' })
  }

  const [[inventory]] = await db.query(
    `SELECT i.id, i.name, i.category, COALESCE(i.item_type,'medicine') AS item_type,
            COALESCE(i.uom,i.base_unit,i.unit,'') AS uom,
            COALESCE(u.allow_decimal_quantity,0) AS allow_decimal_quantity,
            COALESCE(u.decimal_precision,0) AS decimal_precision
     FROM inventory i
     LEFT JOIN inventory_uoms u ON LOWER(u.name)=LOWER(COALESCE(i.uom,i.base_unit,i.unit,''))
     WHERE i.id = ? AND i.archived_at IS NULL LIMIT 1`,
    [inventory_id]
  )
  if (!inventory) return res.status(404).json({ message: 'Inventory item not found.' })

  const precision = Number(inventory.allow_decimal_quantity) === 1 ? Math.min(4, Math.max(1, Number(inventory.decimal_precision || 2))) : 0
  const factor = 10 ** precision
  if (Math.abs(quantity * factor - Math.round(quantity * factor)) > 0.0000001) {
    return res.status(400).json({
      code: 'INVALID_UOM_PRECISION',
      message: precision === 0
        ? `${inventory.name} uses whole ${inventory.uom || 'units'} only.`
        : `${inventory.name} allows at most ${precision} decimal place${precision === 1 ? '' : 's'}.`,
    })
  }
  if (!String(reason || '').trim()) return res.status(400).json({ message: 'Transfer reason is required.' })
  if (String(reason).trim().length > 500) return res.status(400).json({ message: 'Transfer reason must be 500 characters or fewer.' })

  const [[doctorProfile]] = await db.query('SELECT clinic_type, specialty FROM doctors WHERE id=? LIMIT 1', [req.user.id])
  const doctorClinic = doctorProfile?.clinic_type || (String(doctorProfile?.specialty || '').toLowerCase().includes('derm') ? 'derma' : 'medical')
  if (inventory.item_type === 'medicine' && inventory.category !== doctorClinic) {
    return res.status(409).json({
      code: 'SUPPLY_REQUEST_CLINIC_MISMATCH',
      message: `${inventory.name} is assigned to the ${inventory.category === 'derma' ? 'Dermatology' : 'General Medicine'} clinic and cannot be requested for this doctor.`
    })
  }

  // Serialize request creation per doctor so two tabs cannot both pass the
  // duplicate-pending check before either insert commits.
  const conn = await db.getConnection()
  let result
  let rows
  try {
    await conn.beginTransaction()
    await conn.query('SELECT id FROM doctors WHERE id=? FOR UPDATE', [req.user.id])
    const [duplicates] = await conn.query(
      `SELECT id, qty_requested, requested_at FROM supply_requests
       WHERE doctor_id=? AND inventory_id=? AND destination_location_id=? AND status='pending'
       ORDER BY requested_at DESC LIMIT 1`,
      [req.user.id, Number(inventory_id), destination.id]
    )
    if (duplicates.length) {
      await conn.rollback()
      return res.status(409).json({
        code: 'DUPLICATE_SUPPLY_REQUEST',
        existing_request_id: duplicates[0].id,
        message: `A pending request for ${inventory.name} to ${destination.name} already exists. Update or wait for that request instead of creating a duplicate.`
      })
    }

    ;[result] = await conn.query(
      `INSERT INTO supply_requests
       (doctor_id, inventory_id, qty_requested, reason, destination_location, destination_location_id)
       VALUES (?,?,?,?,?,?)`,
      [req.user.id, inventory_id, quantity, reason || null, destination.name, destination.id]
    )
    ;[rows] = await conn.query(
      `SELECT sr.*, i.name AS item_name, i.unit, loc.name AS destination_location
       FROM supply_requests sr
       JOIN inventory i ON sr.inventory_id = i.id
       LEFT JOIN inventory_locations loc ON loc.id = sr.destination_location_id
       WHERE sr.id = ?`,
      [result.insertId]
    )
    await writeAuditLog({ userId: req.user.id, userRole: 'doctor', action: 'supply.request_created', entityType: 'supply_request', entityId: result.insertId, newValues: { inventory_id: Number(inventory_id), qty_requested: quantity, destination_location_id: destination.id, destination_location: destination.name, reason: reason || null }, ipAddress: req.ip || null }, conn)
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
  for (const target_role of ['staff','admin']) {
    await createNotification({ target_role, type: 'supply_request', title: 'Doctor supply transfer request', message: `Requested ${quantity} ${rows[0].unit}(s) of ${rows[0].item_name} for ${destination.name}.`, reference_type: 'supply_request', reference_id: result.insertId })
  }
  broadcast(['staff', 'admin', `doctor_${req.user.id}`], 'supply_request_resolved', { requestId: result.insertId, status: 'pending', doctorId: req.user.id })
  res.status(201).json(rows[0])
}

// ── Doctor's Queue Control ────────────────────────────────────────────────────

// GET /queue — fetch today's queue for this doctor
const getMyQueue = async (req, res) => {
  const today = getTodayDateOnly()
  const [rows] = await db.query(
    `SELECT q.id, q.queue_number, q.patient_name, q.type, q.status,
            q.patient_id, q.appointment_id,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt,
            a.reason, a.appointment_time AS time,
            p.phone AS patient_phone, p.sex AS patient_sex,
            TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()) AS patient_age
     FROM queue q
     LEFT JOIN appointments a ON a.id = q.appointment_id
     LEFT JOIN patients p ON p.id = q.patient_id
     WHERE q.doctor_id = ? AND q.queue_date = ?
       AND q.status IN ('waiting','called','in_consultation')
     ORDER BY q.queue_number ASC`,
    [req.user.id, today]
  )
  res.json(rows)
}

// PATCH /queue/call-next — mark current in-progress as done, set next waiting as in-progress
const callNext = async (req, res) => {
  const result = await callNextQueuePatient({
    doctorId: req.user.id,
    actorRole: 'doctor',
    actorId: req.user.id,
    ipAddress: req.ip || null,
  })
  res.json(result)
}

// PATCH /queue/:id/done — reconciliation-only action. Normal completion happens
// when the consultation is finalized, so clinical and queue state cannot diverge.
const markQueueDone = async (req, res) => {
  const [rows] = await db.query(
    `SELECT q.id, q.appointment_id, a.status AS appointment_status
     FROM queue q LEFT JOIN appointments a ON a.id=q.appointment_id
     WHERE q.id=? AND q.doctor_id=?`,
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Queue entry not found.' })
  if (rows[0].appointment_id && rows[0].appointment_status !== 'completed') {
    return res.status(409).json({ message: 'Complete the consultation before marking this queue entry done.' })
  }
  await setQueueState({ queueId: req.params.id, nextStatus: 'done', actorRole: 'doctor', actorId: req.user.id, ipAddress: req.ip || null })
  res.json({ message: 'Queue entry completed.' })
}

// ── Doctor's Own Schedule ─────────────────────────────────────────────────────

const getMySchedule = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json(rows)
}

const getMyScheduleAll = async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")',
    [req.user.id]
  )
  res.json(rows)
}

const saveMyScheduleDay = async (req, res) => {
  try {
    const result = await saveDoctorScheduleDay({
      doctorId: req.user.id,
      body: req.body,
      actorRole: 'doctor',
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

const getMyUnavailableDates = async (req, res) => {
  const rows = await getDoctorUnavailableDates(req.user.id, {
    startDate: String(req.query.start_date || '').trim() || undefined,
    endDate: String(req.query.end_date || '').trim() || undefined,
  })
  res.json(rows)
}

const saveMyUnavailableDate = async (req, res) => {
  const unavailableDate = toDateOnly(req.body.unavailable_date)
  const reason = String(req.body.reason || '').trim() || null

  if (!isValidDateOnly(unavailableDate)) {
    return res.status(400).json({ message: 'A valid unavailable date is required.' })
  }
  if (unavailableDate < getTodayDateOnly()) {
    return res.status(400).json({ message: 'Cannot block a past date.' })
  }

  const activeCount = await countActiveAppointmentsOnDate(req.user.id, unavailableDate)
  if (activeCount > 0) {
    return res.status(409).json({
      message: 'This date already has active appointments. Reschedule or cancel them first.',
    })
  }

  await db.query(
    `INSERT INTO doctor_unavailable_dates (doctor_id, unavailable_date, reason, created_by_role, created_by_user_id)
     VALUES (?, ?, ?, 'doctor', ?)
     ON DUPLICATE KEY UPDATE
       reason = VALUES(reason),
       created_by_role = 'doctor',
       created_by_user_id = VALUES(created_by_user_id)`,
    [req.user.id, unavailableDate, reason, req.user.id]
  )

  await writeAuditLog({ userId: req.user.id, userRole: 'doctor', action: 'schedule.unavailable_date_saved', entityType: 'doctor_unavailable_date', entityId: `${req.user.id}:${unavailableDate}`, newValues: { unavailable_date: unavailableDate, reason }, ipAddress: req.ip || null }).catch(() => {})
  res.json({ message: 'Unavailable date saved.' })
}

const deleteMyUnavailableDate = async (req, res) => {
  const unavailableDate = toDateOnly(req.params.date)
  if (!isValidDateOnly(unavailableDate)) {
    return res.status(400).json({ message: 'A valid unavailable date is required.' })
  }

  await db.query(
    'DELETE FROM doctor_unavailable_dates WHERE doctor_id = ? AND unavailable_date = ?',
    [req.user.id, unavailableDate]
  )

  await writeAuditLog({ userId: req.user.id, userRole: 'doctor', action: 'schedule.unavailable_date_removed', entityType: 'doctor_unavailable_date', entityId: `${req.user.id}:${unavailableDate}`, ipAddress: req.ip || null }).catch(() => {})
  res.json({ message: 'Unavailable date removed.' })
}

module.exports = {
  login, checkAuth, logout,
  getDashboard, getAppointments, getDailyAppointments, startConsultation,
  saveConsultationDraft, finalizeConsultation, getConsultation, updateConsultation, addConsultationAmendment,
  getPatientHistory, getBillingCatalog, uploadClinicalImage, getClinicalUploadScanStatus,
  getInventoryItems, getMyRequests, getRequestLocations, submitRequest,
  getMyQueue, callNext, markQueueDone,
  getMySchedule, getMyScheduleAll, saveMyScheduleDay,
  getMyUnavailableDates, saveMyUnavailableDate, deleteMyUnavailableDate,
}



