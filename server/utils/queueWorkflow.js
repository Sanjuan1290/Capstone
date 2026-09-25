const db = require('../db/connect')
const { broadcast } = require('./sse')
const { createNotification } = require('./notifications')
const { writeAuditLog } = require('./audit')
const { getTodayDateOnly } = require('./date')

const QUEUE_TRANSITIONS = {
  waiting: new Set(['called', 'removed']),
  called: new Set(['waiting', 'in_consultation', 'removed']),
  in_consultation: new Set(['done']),
  done: new Set([]),
  removed: new Set([]),
}

const normalizeQueueStatus = (value) => {
  const status = String(value || '').trim()
  // Compatibility with pre-refactor clients / rows. The old "in-progress"
  // queue state meant "patient has been called", not "doctor is consulting".
  return status === 'in-progress' ? 'called' : status
}

const assertQueueTransition = (fromStatus, toStatus) => {
  const from = normalizeQueueStatus(fromStatus)
  const to = normalizeQueueStatus(toStatus)
  if (from === to) return
  if (!QUEUE_TRANSITIONS[from]?.has(to)) {
    const error = new Error(`Queue cannot move from ${from || 'unknown'} to ${to || 'unknown'}.`)
    error.statusCode = 409
    error.code = 'INVALID_QUEUE_TRANSITION'
    throw error
  }
}

const getLockedQueueEntry = async (queueId, conn) => {
  const [rows] = await conn.query(
    `SELECT q.id, q.status, q.patient_id, q.doctor_id, q.queue_number, q.appointment_id, q.type,
            q.patient_name, q.queue_date, a.status AS appointment_status,
            p.full_name AS patient_full_name, d.full_name AS doctor_name
     FROM queue q
     LEFT JOIN appointments a ON a.id = q.appointment_id
     LEFT JOIN patients p ON p.id = q.patient_id
     LEFT JOIN doctors d ON d.id = q.doctor_id
     WHERE q.id = ?
     FOR UPDATE`,
    [queueId]
  )
  return rows[0] || null
}

const setQueueState = async ({ queueId, nextStatus, actorRole, actorId, ipAddress = null }) => {
  const target = normalizeQueueStatus(nextStatus)
  const conn = await db.getConnection()
  let row
  let previous

  try {
    await conn.beginTransaction()
    row = await getLockedQueueEntry(queueId, conn)
    if (!row) {
      const error = new Error('Queue entry not found.')
      error.statusCode = 404
      throw error
    }

    previous = normalizeQueueStatus(row.status)
    assertQueueTransition(previous, target)

    const assignments = ['status = ?']
    const params = [target]
    if (target === 'called') assignments.push('called_at = COALESCE(called_at, NOW())')
    if (target === 'in_consultation') assignments.push('consultation_started_at = COALESCE(consultation_started_at, NOW())')
    if (target === 'done') assignments.push('completed_at = COALESCE(completed_at, NOW())')
    if (target === 'waiting') assignments.push('called_at = NULL', 'consultation_started_at = NULL')
    params.push(queueId)

    await conn.query(`UPDATE queue SET ${assignments.join(', ')} WHERE id = ?`, params)

    if (target === 'in_consultation' && row.appointment_id) {
      if (!['confirmed', 'rescheduled', 'in-progress'].includes(String(row.appointment_status || ''))) {
        const error = new Error('The linked appointment is not ready to start a consultation.')
        error.statusCode = 409
        error.code = 'APPOINTMENT_NOT_READY'
        throw error
      }
      await conn.query("UPDATE appointments SET status='in-progress' WHERE id = ?", [row.appointment_id])
    }

    // Queue completion is normally driven by consultation finalization. If an
    // already-completed appointment is being reconciled, keeping the queue in
    // sync is safe. We intentionally do NOT complete an active appointment just
    // because Staff clicks a queue action.
    if (target === 'done' && row.appointment_id && row.appointment_status === 'completed') {
      await conn.query("UPDATE appointments SET status='completed' WHERE id = ?", [row.appointment_id])
    }

    await writeAuditLog({
      userId: actorId || null,
      userRole: actorRole || 'system',
      action: `queue.${target}`,
      entityType: 'queue',
      entityId: queueId,
      oldValues: { status: previous },
      newValues: { status: target, appointment_id: row.appointment_id || null },
      ipAddress,
    }, conn)

    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }

  const audience = ['admin', 'staff', `doctor_${row.doctor_id}`]
  if (row.patient_id) audience.push(`patient_${row.patient_id}`)
  broadcast(audience, 'queue_updated', {
    queueId: Number(queueId),
    status: target,
    doctorId: row.doctor_id,
    appointmentId: row.appointment_id || null,
  })

  if (row.appointment_id && target === 'in_consultation') {
    broadcast(['admin', 'staff', `doctor_${row.doctor_id}`, ...(row.patient_id ? [`patient_${row.patient_id}`] : [])], 'appointment_updated', {
      appointmentId: Number(row.appointment_id),
      status: 'in-progress',
    })
  }

  if (target === 'called' && row.patient_id) {
    await createNotification({
      target_role: 'patient',
      target_user_id: row.patient_id,
      type: 'queue_patient_called',
      title: "It's your turn",
      message: `Queue #${row.queue_number} is being called${row.doctor_name ? ` by ${row.doctor_name}` : ''}. Please proceed to the consultation area.`,
      reference_type: 'appointment',
      reference_id: row.appointment_id || null,
      link: '/patient/appointments',
    }).catch(() => {})
  }

  return { ...row, previous_status: previous, status: target }
}

const startQueueConsultationByAppointment = async ({ appointmentId, doctorId, actorId, ipAddress = null }) => {
  const [rows] = await db.query(
    `SELECT id FROM queue
     WHERE appointment_id = ? AND doctor_id = ? AND queue_date = ?
       AND status IN ('waiting','called','in-progress','in_consultation')
     ORDER BY id DESC LIMIT 1`,
    [appointmentId, doctorId, getTodayDateOnly()]
  )
  if (!rows[0]) return null

  // Legacy in-progress rows are normalized to called by setQueueState.
  const [currentRows] = await db.query('SELECT status FROM queue WHERE id = ? LIMIT 1', [rows[0].id])
  const current = normalizeQueueStatus(currentRows[0]?.status)
  if (current === 'in_consultation') return { id: rows[0].id, status: 'in_consultation' }
  if (current === 'waiting') {
    await setQueueState({ queueId: rows[0].id, nextStatus: 'called', actorRole: 'doctor', actorId, ipAddress })
  }
  return setQueueState({ queueId: rows[0].id, nextStatus: 'in_consultation', actorRole: 'doctor', actorId, ipAddress })
}

const callNextQueuePatient = async ({ doctorId, actorRole, actorId, ipAddress = null }) => {
  const today = getTodayDateOnly()
  const lockName = `carait:queue-call:${Number(doctorId)}:${today}`.slice(0, 64)
  const lockConn = await db.getConnection()

  try {
    const [[lock]] = await lockConn.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName])
    if (Number(lock?.acquired) !== 1) {
      const error = new Error('The queue is being updated. Please try again.')
      error.statusCode = 409
      throw error
    }

    const [activeRows] = await lockConn.query(
      `SELECT id, status, queue_number, patient_name, patient_id, appointment_id
       FROM queue
       WHERE doctor_id=? AND queue_date=? AND status IN ('called','in-progress','in_consultation')
       ORDER BY queue_number ASC LIMIT 1`,
      [doctorId, today]
    )
    if (activeRows[0]) {
      const active = activeRows[0]
      const status = normalizeQueueStatus(active.status)
      return {
        message: status === 'in_consultation'
          ? 'A patient is currently in consultation. Complete that visit before calling the next patient.'
          : 'A patient has already been called. Start or return that patient before calling the next one.',
        nextPatient: { ...active, status },
        alreadyActive: true,
      }
    }

    const [nextRows] = await lockConn.query(
      `SELECT id, queue_number, patient_name, patient_id, appointment_id, type
       FROM queue
       WHERE doctor_id=? AND queue_date=? AND status='waiting'
       ORDER BY queue_number ASC LIMIT 1`,
      [doctorId, today]
    )
    const next = nextRows[0] || null
    if (!next) return { message: 'No more patients in queue.', nextPatient: null }

    // Keep the named lock until the selected row has actually transitioned.
    // This closes the SELECT -> UPDATE race between two callers.
    const updated = await setQueueState({ queueId: next.id, nextStatus: 'called', actorRole, actorId, ipAddress })
    return { message: 'Next patient called.', nextPatient: { ...next, status: updated.status } }
  } finally {
    await lockConn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {})
    lockConn.release()
  }
}

module.exports = {
  QUEUE_TRANSITIONS,
  normalizeQueueStatus,
  assertQueueTransition,
  setQueueState,
  startQueueConsultationByAppointment,
  callNextQueuePatient,
}

