const db = require('../db/connect')
const { getClinicDateTimeSql } = require('./date')
const { loadBookingSettings, buildConfirmationDeadlineSql } = require('./bookingPolicy')
const { createNotification, notifyRoles } = require('./notifications')
const { sendAppointmentStatusEmail } = require('./emailService')
const { sendPatientAppointmentStatusSms } = require('./smsService')
const { writeAuditLog } = require('./audit')
const { broadcast } = require('./sse')

const clinicContactText = (settings = {}) => {
  const contacts = [settings.phone, settings.email].filter((value) => String(value || '').trim())
  return contacts.length ? ` Contact the clinic at ${contacts.join(' / ')} if you need help booking another schedule.` : ' Please use the Patient Portal to book another available schedule.'
}

const dateOnly = (value) => String(value || '').slice(0, 10)

const backfillMissingConfirmationDeadlines = async ({ appointmentId = null, limit = 1000 } = {}) => {
  const settings = await loadBookingSettings()
  const params = []
  let where = `status = 'pending'
               AND appointment_source = 'online'
               AND confirmation_deadline_at IS NULL`
  if (Number(appointmentId) > 0) {
    where += ' AND id = ?'
    params.push(Number(appointmentId))
  }
  params.push(Math.max(1, Math.min(5000, Number(limit) || 1000)))

  const [rows] = await db.query(
    `SELECT id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
     FROM appointments
     WHERE ${where}
     ORDER BY appointment_date ASC, id ASC
     LIMIT ?`,
    params
  )

  let backfilled = 0
  for (const row of rows) {
    const deadline = buildConfirmationDeadlineSql({
      date: dateOnly(row.appointment_date),
      time: row.appointment_time,
      cutoffMinutes: settings.pending_confirmation_cutoff_minutes,
    })
    if (!deadline) continue

    const [updated] = await db.query(
      `UPDATE appointments
       SET confirmation_deadline_at = ?
       WHERE id = ?
         AND status = 'pending'
         AND appointment_source = 'online'
         AND confirmation_deadline_at IS NULL`,
      [deadline, row.id]
    )
    backfilled += Number(updated.affectedRows || 0)
  }

  return { backfilled }
}

const expirePendingAppointments = async ({ appointmentId = null, limit = 100 } = {}) => {
  // Legacy online bookings created before the deadline feature may still be pending with a NULL deadline.
  // Derive and persist their effective deadline first so they follow the same policy as new bookings.
  await backfillMissingConfirmationDeadlines({ appointmentId }).catch((error) => {
    console.error('[Appointments] Confirmation deadline backfill failed:', error.message)
  })

  const nowSql = getClinicDateTimeSql()
  const params = [nowSql]
  let where = `a.status = 'pending'
               AND a.appointment_source = 'online'
               AND a.confirmation_deadline_at IS NOT NULL
               AND a.confirmation_deadline_at <= ?`
  if (Number(appointmentId) > 0) {
    where += ' AND a.id = ?'
    params.push(Number(appointmentId))
  }
  params.push(Math.max(1, Math.min(500, Number(limit) || 100)))

  const [rows] = await db.query(
    `SELECT a.id, a.patient_id, a.doctor_id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date, a.appointment_time, a.clinic_type,
            a.confirmation_deadline_at,
            p.full_name AS patient_name, p.email AS patient_email, p.phone AS patient_phone,
            p.email_verified_at, p.phone_verified_at,
            d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN doctors d ON d.id = a.doctor_id
     WHERE ${where}
     ORDER BY a.confirmation_deadline_at ASC, a.id ASC
     LIMIT ?`,
    params
  )
  if (!rows.length) return { rejected: 0 }

  const [[clinicSettings]] = await db.query(
    'SELECT clinic_name, phone, email FROM clinic_settings WHERE id = 1 LIMIT 1'
  ).catch(() => [[{}]])
  const contactNote = clinicContactText(clinicSettings || {})
  let rejected = 0

  for (const row of rows) {
    const [updated] = await db.query(
      `UPDATE appointments
       SET status = 'rejected', rejected_at = ?, rejected_by_role = 'system', rejection_reason = 'confirmation_timeout'
       WHERE id = ? AND status = 'pending' AND appointment_source = 'online'
         AND confirmation_deadline_at IS NOT NULL AND confirmation_deadline_at <= ?`,
      [nowSql, row.id, nowSql]
    )
    if (Number(updated.affectedRows || 0) !== 1) continue
    rejected += 1

    const inAppMessage = `Your appointment request for ${dateOnly(row.appointment_date)} at ${row.appointment_time} was not confirmed before the clinic deadline, so the requested time was released.${contactNote}`
    await createNotification({
      target_role: 'patient',
      target_user_id: row.patient_id,
      type: 'appointment_rejected',
      title: 'Appointment request not confirmed',
      message: inAppMessage,
      reference_type: 'appointment',
      reference_id: row.id,
    }).catch(() => {})

    const notes = `Please book another available schedule through the Patient Portal.${contactNote}`
    if (row.patient_email && row.email_verified_at) {
      await sendAppointmentStatusEmail({
        to: row.patient_email,
        patient_name: row.patient_name,
        doctor_name: row.doctor_name,
        appointment_date: row.appointment_date,
        appointment_time: row.appointment_time,
        clinic_type: row.clinic_type,
        status: 'rejected',
        notes,
      }).catch((err) => console.error('[Appointments] Rejection email failed:', err.message))
    } else if (row.patient_phone && row.phone_verified_at) {
      await sendPatientAppointmentStatusSms({
        patientId: row.patient_id,
        patientPhone: row.patient_phone,
        patientName: row.patient_name,
        doctorName: row.doctor_name,
        appointmentDate: dateOnly(row.appointment_date),
        appointmentTime: row.appointment_time,
        status: 'rejected',
        notes: contactNote.trim(),
      }).catch((err) => console.error('[Appointments] Rejection SMS failed:', err.message))
    }

    await notifyRoles(['admin', 'staff'], {
      type: 'appointment_rejected',
      title: 'Pending appointment released',
      message: `${row.patient_name}'s appointment request for ${dateOnly(row.appointment_date)} at ${row.appointment_time} was automatically rejected because it was not confirmed before the deadline.`,
      reference_type: 'appointment',
      reference_id: row.id,
    }).catch(() => {})

    await writeAuditLog({
      userId: null,
      userRole: 'system',
      action: 'appointment.rejected_confirmation_timeout',
      entityType: 'appointment',
      entityId: row.id,
      oldValues: { status: 'pending', confirmation_deadline_at: row.confirmation_deadline_at },
      newValues: { status: 'rejected', rejected_by_role: 'system', rejection_reason: 'confirmation_timeout', rejected_at: nowSql },
      ipAddress: null,
    }).catch(() => {})

    broadcast(['admin', 'staff', `doctor_${row.doctor_id}`, `patient_${row.patient_id}`], 'appointment_updated', {
      appointmentId: Number(row.id),
      status: 'rejected',
    })
  }

  return { rejected }
}

module.exports = { expirePendingAppointments, backfillMissingConfirmationDeadlines }

