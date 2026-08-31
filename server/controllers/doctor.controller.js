// server/controllers/doctor.controller.js

const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')
const { issueSession, verifySessionToken } = require('../utils/sessionSecurity')
const { createNotification } = require('../utils/notifications')
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
const { loadImagesForConsultationIds, syncConsultationImages } = require('../utils/consultationImages')
const { listBillingCatalog, getBillingByAppointmentId, upsertDraftBillingForAppointment, collectInventoryUsageFromBillingItems } = require('../utils/billing')
const { consumeInventoryFromLocationFEFO, getInventoryLocationById } = require('../utils/inventoryBatches')
const { writeAuditLog } = require('../utils/audit')
const { validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition } = require('../utils/appointmentSecurity')
const { createClinicalUploadSignature } = require('../utils/cloudinarySecurity')
const { loadConsultationAmendments, assertConsultationEditable } = require('../utils/consultationIntegrity')

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
    user: { id: doctor.id, full_name: doctor.full_name, email: doctor.email, specialty: doctor.specialty, prc_license: doctor.prc_license, role: 'doctor', theme_preference: doctor.theme_preference, profile_image_url: doctor.profile_image_url, must_change_password: Boolean(doctor.must_change_password) },
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies['doctor_token']
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = await verifySessionToken(token, 'doctor')
    const [rows] = await db.query(
      'SELECT id, full_name, email, specialty, prc_license, theme_preference, profile_image_url, must_change_password, password_changed_at FROM doctors WHERE id = ? AND is_active = 1', [decoded.id]
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

    // Consume FEFO inside the treatment room first, then Main Stockroom as a safe
    // fallback. The exact source batch and source location are recorded below.
    const consumption = await consumeInventoryFromLocationFEFO(
      entry.inventory_id,
      packageQuantity,
      preferredLocation,
      conn,
      { fallbackLocation: 'Main Stockroom' }
    )
    if (!consumption.ok) throw new Error(`Not enough stock for ${inventory.name}. ${consumption.message}`)

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
         (consultation_usage_id, batch_id, package_quantity, usage_quantity, usage_unit_label, source_location)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [usageId, batch.batch_id, Number(batch.quantity || 0), allocatedUsage, entry.unit_label || inventory.unit, batch.location || preferredLocation]
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
  await markOverdueAppointments()
  const today = getTodayDateOnly()
  const [[{ totalToday }]]      = await db.query(
    'SELECT COUNT(*) AS totalToday FROM appointments WHERE doctor_id = ? AND appointment_date = ?',
    [req.user.id, today]
  )
  const [[{ completed }]]       = await db.query(
    "SELECT COUNT(*) AS completed FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = 'completed'",
    [req.user.id, today]
  )
  const [[{ pending }]]         = await db.query(
    "SELECT COUNT(*) AS pending FROM appointments WHERE doctor_id = ? AND status = 'pending'",
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
     WHERE q.doctor_id = ? AND q.queue_date = ? AND q.status IN ('waiting','in-progress')
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
       AND a.status IN ('pending','confirmed','rescheduled')
     ORDER BY a.appointment_date ASC, a.appointment_time ASC
     LIMIT 8`,
    [req.user.id, today]
  )
  res.json({ totalToday, completed, pending, pendingRequests, schedule, walkInQueue, upcomingAppointments })
}

// ── Appointments ──────────────────────────────────────────────────────────────

const getDailyAppointments = async (req, res) => {
  await markOverdueAppointments()
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
  const [rows] = await db.query(
    'SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' })
  assertAppointmentTransition(rows[0].status, 'in-progress')
  await db.query("UPDATE appointments SET status = 'in-progress' WHERE id = ?", [req.params.id])
  const [queueRows] = await db.query(
    `SELECT id
     FROM queue
     WHERE appointment_id = ? AND doctor_id = ? AND status IN ('waiting','in-progress')
     ORDER BY id DESC
     LIMIT 1`,
    [req.params.id, req.user.id]
  )
  if (queueRows.length > 0) {
    await db.query("UPDATE queue SET status = 'in-progress' WHERE id = ?", [queueRows[0].id])
    broadcast(['admin', 'staff', `doctor_${req.user.id}`], 'queue_updated', {
      queueId: queueRows[0].id,
      status: 'in-progress',
      doctorId: req.user.id,
    })
  }
  broadcast(['admin', 'staff'], 'appointment_updated', { appointmentId: Number(req.params.id), status: 'in-progress' })
  res.json({ message: 'Consultation started.' })
}

const saveConsultation = async (req, res) => {
  const { diagnosis, prescription, notes } = req.body
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
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?',
      [appointmentId, req.user.id]
    )
    if (apptRows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ message: 'Appointment not found.' })
    }

    appt = apptRows[0]

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
      await syncConsultationImages(consultationId, images, conn)
    }
    billing = await upsertDraftBillingForAppointment({
      appointment: appt,
      consultationId,
      items: billableServices,
    }, conn)
    await consumeClinicalInventory({ billing, consultationId, doctorId: req.user.id, appointment: appt }, conn)

    await conn.query(
      `UPDATE consultations
       SET status='finalized', finalized_at=NOW(), finalized_by_doctor_id=?, updated_at=NOW()
       WHERE id=?`,
      [req.user.id, consultationId]
    )
    assertAppointmentTransition(appt.status, 'completed')
    await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointmentId])
    await writeAuditLog({
      userId: req.user.id, userRole: 'doctor', action: 'clinical.consultation_finalized', entityType: 'consultation', entityId: consultationId,
      newValues: { appointment_id: Number(appointmentId), services_count: Array.isArray(billableServices) ? billableServices.length : 0, status: 'finalized' },
      ipAddress: req.ip || null,
    }, conn)

    const [queueRows] = await conn.query(
      `SELECT id
       FROM queue
       WHERE appointment_id = ? AND doctor_id = ? AND status IN ('waiting','in-progress')
       ORDER BY id DESC
       LIMIT 1`,
      [appointmentId, req.user.id]
    )
    if (queueRows.length > 0) {
      queueId = queueRows[0].id
      await conn.query("UPDATE queue SET status = 'done' WHERE id = ?", [queueId])
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
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
  res.json({ message: 'Consultation saved.', consultation_id: consultationId, billing })
}

// ── NEW: Get a single consultation (for viewing/editing after completion) ─────
const getConsultation = async (req, res) => {
  const { appointmentId } = req.params
  const [rows] = await db.query(
    `SELECT c.*, a.clinic_type AS type, a.reason, a.appointment_time AS time,
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
  const { diagnosis, prescription, notes } = req.body
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
      await syncConsultationImages(consultation.id, req.body.images, conn)
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
  const reason = String(req.body?.reason || '').trim()
  const amendmentText = String(req.body?.amendment_text || '').trim()
  if (!appointmentId || !reason || !amendmentText) {
    return res.status(400).json({ message: 'Amendment reason and text are required.' })
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
     WHERE a.patient_id = ? AND a.status IN ('completed','cancelled','no_show')
     ORDER BY a.appointment_date DESC`,
    [patientId]
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

const getClinicalUploadSignature = async (req, res) => {
  const appointmentId = Number(req.body?.appointment_id)
  if (!appointmentId) return res.status(400).json({ message: 'A valid appointment is required.' })
  const [rows] = await db.query(
    `SELECT id FROM appointments WHERE id = ? AND doctor_id = ? LIMIT 1`,
    [appointmentId, req.user.id]
  )
  if (!rows.length) return res.status(403).json({ message: 'You are not authorized to upload images for this appointment.' })
  res.json(createClinicalUploadSignature({ doctorId: req.user.id, appointmentId }))
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const getBillingCatalog = async (req, res) => {
  const rows = await listBillingCatalog({
    clinicType: String(req.query.clinic_type || '').trim() || undefined,
  })
  res.json(rows)
}

const getInventoryItems = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, category, unit, base_unit, unit_size, stock, stock_base, threshold, price FROM inventory WHERE stock > 0 ORDER BY category, name'
  )
  res.json(rows)
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
    const [[doctorRow]] = await db.query('SELECT specialty FROM doctors WHERE id = ? LIMIT 1', [req.user.id])
    const defaultDestination = String(doctorRow?.specialty || '').toLowerCase().includes('derm') ? 'Dermatology Room' : 'General Medicine Room'
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

  const [[inventory]] = await db.query('SELECT id FROM inventory WHERE id = ? LIMIT 1', [inventory_id])
  if (!inventory) return res.status(404).json({ message: 'Inventory item not found.' })

  const [result] = await db.query(
    `INSERT INTO supply_requests
     (doctor_id, inventory_id, qty_requested, reason, destination_location, destination_location_id)
     VALUES (?,?,?,?,?,?)`,
    [req.user.id, inventory_id, quantity, reason || null, destination.name, destination.id]
  )
  const [rows] = await db.query(
    `SELECT sr.*, i.name AS item_name, i.unit, loc.name AS destination_location
     FROM supply_requests sr
     JOIN inventory i ON sr.inventory_id = i.id
     LEFT JOIN inventory_locations loc ON loc.id = sr.destination_location_id
     WHERE sr.id = ?`,
    [result.insertId]
  )
  await writeAuditLog({ userId: req.user.id, userRole: 'doctor', action: 'supply.request_created', entityType: 'supply_request', entityId: result.insertId, newValues: { inventory_id: Number(inventory_id), qty_requested: quantity, destination_location_id: destination.id, destination_location: destination.name, reason: reason || null }, ipAddress: req.ip || null })
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
       AND q.status IN ('waiting','in-progress')
     ORDER BY q.queue_number ASC`,
    [req.user.id, today]
  )
  res.json(rows)
}

// PATCH /queue/call-next — mark current in-progress as done, set next waiting as in-progress
const callNext = async (req, res) => {
  const today = getTodayDateOnly()
  const doctorId = req.user.id

  // Mark current in-progress patient as done
  const [currentRows] = await db.query(
    `SELECT id FROM queue WHERE doctor_id=? AND queue_date=? AND status='in-progress'`,
    [doctorId, today]
  )
  await db.query(
    `UPDATE queue SET status='done' WHERE doctor_id=? AND queue_date=? AND status='in-progress'`,
    [doctorId, today]
  )
  if (currentRows[0]?.id) {
    broadcast(['admin', 'staff', `doctor_${doctorId}`], 'queue_updated', { queueId: currentRows[0].id, status: 'done', doctorId })
  }

  // Get the next waiting patient
  const [nextRows] = await db.query(
    `SELECT id, queue_number, patient_name, type FROM queue
     WHERE doctor_id=? AND queue_date=? AND status='waiting'
     ORDER BY queue_number ASC LIMIT 1`,
    [doctorId, today]
  )

  if (nextRows.length === 0) {
    return res.json({ message: 'No more patients in queue.', nextPatient: null })
  }

  const next = nextRows[0]
  await db.query(`UPDATE queue SET status='in-progress' WHERE id=?`, [next.id])
  broadcast(['admin', 'staff', `doctor_${doctorId}`], 'queue_updated', { queueId: next.id, status: 'call-next', doctorId })
  res.json({ message: 'Next patient called.', nextPatient: next })
}

// PATCH /queue/:id/done — mark a specific queue entry as done
const markQueueDone = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id FROM queue WHERE id=? AND doctor_id=?',
    [req.params.id, req.user.id]
  )
  if (rows.length === 0) return res.status(404).json({ message: 'Queue entry not found.' })
  await db.query(`UPDATE queue SET status='done' WHERE id=?`, [req.params.id])
  broadcast(['admin', 'staff', `doctor_${req.user.id}`], 'queue_updated', { queueId: Number(req.params.id), status: 'done', doctorId: req.user.id })
  res.json({ message: 'Marked as done.' })
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
  const { day_of_week, start_time, end_time, slot_duration_mins, is_active } = req.body
  if (!day_of_week || !start_time || !end_time)
    return res.status(400).json({ message: 'day_of_week, start_time, and end_time are required.' })

  const doctorId = req.user.id
  const [existing] = await db.query(
    'SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [doctorId, day_of_week]
  )
  if (existing.length > 0) {
    await db.query(
      'UPDATE doctor_schedules SET start_time=?, end_time=?, slot_duration_mins=?, is_active=? WHERE doctor_id=? AND day_of_week=?',
      [start_time, end_time, slot_duration_mins||60, is_active??1, doctorId, day_of_week]
    )
  } else {
    await db.query(
      'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active) VALUES (?,?,?,?,?,?)',
      [doctorId, day_of_week, start_time, end_time, slot_duration_mins||60, is_active??1]
    )
  }
  await writeAuditLog({ userId: req.user.id, userRole: 'doctor', action: 'schedule.updated', entityType: 'doctor_schedule', entityId: `${req.user.id}:${day_of_week}`, newValues: { day_of_week, start_time, end_time, slot_duration_mins: slot_duration_mins || 60, is_active: is_active ?? 1 }, ipAddress: req.ip || null }).catch(() => {})
  res.json({ message: 'Schedule saved.' })
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
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getConsultation, updateConsultation, addConsultationAmendment,
  getPatientHistory, getBillingCatalog, getClinicalUploadSignature,
  getInventoryItems, getMyRequests, getRequestLocations, submitRequest,
  getMyQueue, callNext, markQueueDone,
  getMySchedule, getMyScheduleAll, saveMyScheduleDay,
  getMyUnavailableDates, saveMyUnavailableDate, deleteMyUnavailableDate,
}


