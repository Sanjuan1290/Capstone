const db = require('../db/connect')
const { getTodayDateOnly, getCurrentTimeLabel } = require('./date')
const { broadcast } = require('./sse')
const { writeAuditLog } = require('./audit')
const { buildWalkInDoctorAvailability } = require('./doctorAvailabilitySummary')

const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']

const formatAppointment = (row) => row ? {
  id: row.id,
  status: row.status,
  clinic_type: row.clinic_type,
  reason: row.reason,
  appointment_date: row.appointment_date,
  appointment_time: row.appointment_time,
  doctor_id: row.doctor_id,
  doctor_name: row.doctor_name,
} : null

const getWalkInPrecheck = async (patientId, executor = db) => {
  const id = Number(patientId) || 0
  if (!id) return { active_queue: null, today_appointment: null, upcoming_appointment: null }
  const today = getTodayDateOnly()

  const [queueRows] = await executor.query(
    `SELECT q.id, q.queue_number, q.status, q.doctor_id, q.patient_name, d.full_name AS doctor_name
     FROM queue q
     JOIN doctors d ON d.id = q.doctor_id
     WHERE q.patient_id = ? AND q.queue_date = ? AND q.status IN ('waiting','called','in_consultation')
     ORDER BY q.id DESC LIMIT 1`,
    [id, today]
  )

  const [appointmentRows] = await executor.query(
    `SELECT a.id, a.status, a.clinic_type, a.reason,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            a.appointment_time, a.doctor_id, d.full_name AS doctor_name
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ?
       AND a.status IN (${ACTIVE_APPOINTMENT_STATUSES.map(() => '?').join(',')})
       AND a.appointment_date >= ?
     ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.id ASC`,
    [id, ...ACTIVE_APPOINTMENT_STATUSES, today]
  )

  const todayAppointment = appointmentRows.find((row) => row.appointment_date === today) || null
  const upcomingAppointment = appointmentRows.find((row) => row.appointment_date > today) || null
  return {
    active_queue: queueRows[0] || null,
    today_appointment: formatAppointment(todayAppointment),
    upcoming_appointment: formatAppointment(upcomingAppointment),
  }
}

const resolveWalkInDoctor = async ({ doctorId, clinicType }, executor = db) => {
  const numericDoctorId = Number(doctorId) || 0
  if (!numericDoctorId) {
    return { ok: false, message: 'Select a doctor who is currently available.' }
  }

  const availability = await buildWalkInDoctorAvailability({ clinicType }, executor)
  const doctor = (availability.doctors || []).find((row) => Number(row.id) === numericDoctorId)
  if (!doctor) {
    return { ok: false, message: 'The selected doctor is not active for this clinic.' }
  }
  if (!doctor.available_now) {
    return {
      ok: false,
      message: doctor.availability_reason || 'The selected doctor is not currently available for a walk-in.',
    }
  }

  return { ok: true, doctor }
}

const addWalkInVisit = async ({
  patientId,
  patientName,
  doctorId,
  clinicType,
  reason,
  checkInAppointmentId = null,
  allowSeparateWalkIn = false,
  actorRole,
  actorId,
  ipAddress,
}, executor = db) => {
  const id = Number(patientId) || 0
  if (!id) return { ok: false, status: 400, body: { message: 'Select or register a patient first.' } }
  if (!['medical', 'derma'].includes(String(clinicType))) {
    return { ok: false, status: 400, body: { message: 'Select a valid clinic type.' } }
  }

  const conn = executor === db ? await db.getConnection() : executor
  const ownsConnection = executor === db
  let lockKey = null
  try {
    if (ownsConnection) await conn.beginTransaction()
    const precheck = await getWalkInPrecheck(id, conn)
    if (precheck.active_queue) {
      if (ownsConnection) await conn.rollback()
      return { ok: false, status: 409, body: { code: 'ALREADY_IN_QUEUE', message: 'This patient is already in today’s queue.', ...precheck } }
    }

    let appointmentId = null
    let resolvedDoctorId = doctorId
    let resolvedDoctorName = null
    let checkedInExisting = false

    if (precheck.today_appointment && Number(checkInAppointmentId) === Number(precheck.today_appointment.id)) {
      appointmentId = precheck.today_appointment.id
      resolvedDoctorId = precheck.today_appointment.doctor_id
      resolvedDoctorName = precheck.today_appointment.doctor_name || null
      checkedInExisting = true
      await conn.query(
        `UPDATE appointments SET checked_in_at = NOW(), status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END WHERE id = ?`,
        [appointmentId]
      )
    } else {
      if (precheck.today_appointment && !allowSeparateWalkIn) {
        if (ownsConnection) await conn.rollback()
        return { ok: false, status: 409, body: { code: 'TODAY_APPOINTMENT', message: 'This patient already has an appointment today. Check them in to that appointment or explicitly create a separate walk-in.', ...precheck } }
      }
      const doctorResult = await resolveWalkInDoctor({ doctorId, clinicType }, conn)
      if (!doctorResult.ok) {
        if (ownsConnection) await conn.rollback()
        return { ok: false, status: 400, body: { message: doctorResult.message, ...precheck } }
      }
      resolvedDoctorId = doctorResult.doctor.id
      resolvedDoctorName = doctorResult.doctor.full_name || null
      const [appointmentResult] = await conn.query(
        `INSERT INTO appointments
         (patient_id, doctor_id, clinic_type, reason, appointment_date, appointment_time, status, appointment_source, checked_in_at)
         VALUES (?,?,?,?,?,?, 'confirmed', 'walk_in', NOW())`,
        [id, resolvedDoctorId, clinicType, reason || 'General Consultation', getTodayDateOnly(), getCurrentTimeLabel()]
      )
      appointmentId = appointmentResult.insertId
    }

    const today = getTodayDateOnly()
    lockKey = `queue:${today}:${resolvedDoctorId}`
    const [[queueLock]] = await conn.query('SELECT GET_LOCK(?, 5) AS acquired', [lockKey])
    if (Number(queueLock?.acquired) !== 1) {
      const error = new Error('The doctor queue is being updated. Please try again.')
      error.statusCode = 409
      error.code = 'QUEUE_BUSY'
      throw error
    }
    const [[{ maxQ }]] = await conn.query(
      'SELECT COALESCE(MAX(queue_number), 0) AS maxQ FROM queue WHERE queue_date = ? AND doctor_id = ?',
      [today, resolvedDoctorId]
    )
    const queueNumber = Number(maxQ || 0) + 1
    const [queueResult] = await conn.query(
      `INSERT INTO queue
       (patient_id, doctor_id, queue_number, patient_name, type, status, queue_date, appointment_id)
       VALUES (?,?,?,?,?,'waiting',?,?)`,
      [id, resolvedDoctorId, queueNumber, patientName || 'Walk-in', clinicType, today, appointmentId]
    )
    await conn.query('SELECT RELEASE_LOCK(?)', [lockKey])
    lockKey = null

    await writeAuditLog({
      userId: actorId,
      userRole: actorRole,
      action: checkedInExisting ? 'walkin.appointment_checked_in' : 'walkin.visit_created',
      entityType: 'queue',
      entityId: queueResult.insertId,
      newValues: {
        patient_id: id,
        doctor_id: resolvedDoctorId,
        appointment_id: appointmentId,
        queue_number: queueNumber,
        clinic_type: clinicType,
        reason: reason || 'General Consultation',
        appointment_source: checkedInExisting ? 'online' : 'walk_in',
        separate_from_existing_today: Boolean(precheck.today_appointment && !checkedInExisting),
      },
      ipAddress,
    }, conn)

    if (ownsConnection) await conn.commit()

    broadcast(['admin', 'staff', `doctor_${resolvedDoctorId}`], 'queue_updated', { queueId: queueResult.insertId, status: 'added', doctorId: Number(resolvedDoctorId) })
    broadcast(['admin', 'staff', `doctor_${resolvedDoctorId}`, `patient_${id}`], 'appointment_updated', { appointmentId, status: 'confirmed' })

    return {
      ok: true,
      status: 201,
      body: {
        id: queueResult.insertId,
        queue_number: queueNumber,
        appointment_id: appointmentId,
        doctor_id: Number(resolvedDoctorId),
        doctor_name: resolvedDoctorName,
        checked_in_existing_appointment: checkedInExisting,
        upcoming_appointment: precheck.upcoming_appointment || null,
      },
    }
  } catch (error) {
    if (lockKey) await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]).catch(() => {})
    if (ownsConnection) await conn.rollback().catch(() => {})
    throw error
  } finally {
    if (ownsConnection) conn.release()
  }
}

module.exports = {
  getWalkInPrecheck,
  resolveWalkInDoctor,
  addWalkInVisit,
}
