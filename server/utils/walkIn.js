const db = require('../db/connect')
const { getTodayDateOnly, getCurrentTimeLabel } = require('./date')
const { broadcast } = require('./sse')
const { writeAuditLog } = require('./audit')

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
     WHERE q.patient_id = ? AND q.queue_date = ? AND q.status IN ('waiting','in-progress')
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
  const today = getTodayDateOnly()
  const normalizedType = String(clinicType || '').toLowerCase()
  const specialtyCondition = normalizedType === 'derma'
    ? "LOWER(d.specialty) LIKE '%derm%'"
    : "LOWER(d.specialty) NOT LIKE '%derm%'"

  const baseWhere = `d.is_active = 1
    AND ${specialtyCondition}
    AND NOT EXISTS (
      SELECT 1 FROM doctor_unavailable_dates u
      WHERE u.doctor_id = d.id AND u.unavailable_date = ?
    )`

  if (doctorId && doctorId !== 'first_available') {
    const [rows] = await executor.query(
      `SELECT d.id, d.full_name, d.specialty,
              EXISTS(
                SELECT 1 FROM doctor_schedules ds
                WHERE ds.doctor_id = d.id AND ds.day_of_week = DAYNAME(?) AND ds.is_active = 1
                  AND CURTIME() BETWEEN ds.start_time AND ds.end_time
              ) AS on_duty
       FROM doctors d
       WHERE d.id = ? AND ${baseWhere}
       LIMIT 1`,
      [today, doctorId, today]
    )
    if (!rows[0]) return { ok: false, message: 'The selected doctor is not available for this clinic type today.' }
    if (!Number(rows[0].on_duty)) return { ok: false, message: 'The selected doctor is not currently on duty.' }
    return { ok: true, doctor: rows[0] }
  }

  const [rows] = await executor.query(
    `SELECT d.id, d.full_name, d.specialty,
            COUNT(CASE WHEN q.status IN ('waiting','in-progress') THEN 1 END) AS active_queue_count
     FROM doctors d
     JOIN doctor_schedules ds
       ON ds.doctor_id = d.id
      AND ds.day_of_week = DAYNAME(?)
      AND ds.is_active = 1
      AND CURTIME() BETWEEN ds.start_time AND ds.end_time
     LEFT JOIN queue q ON q.doctor_id = d.id AND q.queue_date = ?
     WHERE ${baseWhere}
     GROUP BY d.id, d.full_name, d.specialty
     ORDER BY active_queue_count ASC, d.full_name ASC
     LIMIT 1`,
    [today, today, today]
  )
  if (!rows[0]) return { ok: false, message: 'No on-duty doctor is currently available for this clinic type.' }
  return { ok: true, doctor: rows[0] }
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
    await conn.query('SELECT GET_LOCK(?, 5)', [lockKey])
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
