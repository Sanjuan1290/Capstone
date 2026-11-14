const { getTodayDateOnly } = require('./date')
const { writeAuditLog } = require('./audit')
const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code: statusCode === 409 ? 'FOLLOWUP_CONFLICT' : 'FOLLOWUP_INVALID' })

function normalizeFollowup(value, prior = null, today = getTodayDateOnly()) {
  if (value === null) return { return_date: null, doctor_note: null, status: 'removed' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Enter a recommended return date and an optional doctor’s note.')
  const date = value.return_date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw invalid('Select a valid recommended return date.')
  if (date < today && date !== prior?.return_date) throw invalid('The recommended return date must be today or later.')
  if (value.doctor_note != null && typeof value.doctor_note !== 'string') throw invalid('Doctor’s note must be text.')
  if (String(value.doctor_note || '').length > 2000) throw invalid('Doctor’s note must be at most 2,000 characters.')
  const note = String(value.doctor_note || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  return { return_date: date, doctor_note: note || null, status: 'active' }
}

async function readFollowup(consultationId, conn) {
  const [[row]] = await conn.query("SELECT *,DATE_FORMAT(return_date,'%Y-%m-%d') AS return_date FROM consultation_followups WHERE consultation_id=?", [consultationId])
  return row || null
}

async function saveFollowup({ consultationId, appointment, doctorId, value, expectedVersion, ip }, conn) {
  if (value === undefined) return undefined // Older clients preserve saved recommendations.
  const [[prior]] = await conn.query("SELECT *,DATE_FORMAT(return_date,'%Y-%m-%d') AS return_date FROM consultation_followups WHERE consultation_id=? FOR UPDATE", [consultationId])
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion !== Number(prior?.version || 0))) throw invalid('This recommendation changed. Reload it before saving.', 409)
  const normalized = normalizeFollowup(value, prior)
  if (!prior && normalized.status === 'removed') return null
  if (prior && ['return_date','doctor_note','status'].every(key => (prior[key] ?? null) === normalized[key])) return prior
  const version = Number(prior?.version || 0) + 1
  let id = prior?.id
  if (prior) await conn.query('UPDATE consultation_followups SET return_date=?,doctor_note=?,status=?,version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [normalized.return_date, normalized.doctor_note, normalized.status, version, id])
  else {
    const [inserted] = await conn.query('INSERT INTO consultation_followups (consultation_id,appointment_id,doctor_id,patient_id,branch_id,return_date,doctor_note,status,version) VALUES (?,?,?,?,?,?,?,?,?)', [consultationId, appointment.id, doctorId, appointment.patient_id, appointment.branch_id, normalized.return_date, normalized.doctor_note, normalized.status, version])
    id = inserted.insertId
  }
  await conn.query('INSERT INTO consultation_followup_revisions (followup_id,version,return_date,doctor_note,status,changed_by_doctor_id) VALUES (?,?,?,?,?,?)', [id, version, normalized.return_date, normalized.doctor_note, normalized.status, doctorId])
  await writeAuditLog({ userId:doctorId, userRole:'doctor', branchId:appointment.branch_id, action:'clinical.followup_updated', entityType:'consultation', entityId:consultationId, newValues:{ followup_id:id, version, status:normalized.status }, ipAddress:ip }, conn)
  return { id, consultation_id:consultationId, ...normalized, version }
}

async function updateDoctorFollowup(req, res) {
  const db = require('../db/connect'), conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[row]] = await conn.query('SELECT c.id AS consultation_id,a.id,a.patient_id,a.branch_id FROM consultations c JOIN appointments a ON a.id=c.appointment_id AND a.branch_id=c.branch_id WHERE c.appointment_id=? AND c.doctor_id=? AND c.branch_id=? FOR UPDATE', [req.params.appointmentId, req.user.id, req.branchId])
    if (!row) throw invalid('Consultation not found in this branch.',404)
    if (!Object.prototype.hasOwnProperty.call(req.body,'follow_up') || !Number.isSafeInteger(req.body.expected_version)) throw invalid('Recommendation and its saved version are required.')
    const follow_up = await saveFollowup({ consultationId:row.consultation_id, appointment:row, doctorId:req.user.id, value:req.body.follow_up, expectedVersion:req.body.expected_version, ip:req.ip },conn)
    await conn.commit()
    res.json({ follow_up })
  } catch(e) { await conn.rollback(); if(e.statusCode) return res.status(e.statusCode).json({ code:e.code,message:e.message }); throw e }
  finally { conn.release() }
}

async function listPatientFollowups(req,res) {
  const db=require('../db/connect')
  const [rows]=await db.query(`SELECT f.id,f.consultation_id,f.appointment_id,f.branch_id,
    DATE_FORMAT(f.return_date,'%Y-%m-%d') AS return_date,f.doctor_note,f.status,f.version,
    DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS original_date,d.full_name AS doctor_name,b.name AS branch_name,
    (SELECT l.appointment_id FROM appointment_followup_links l JOIN appointments booked ON booked.id=l.appointment_id
      WHERE l.followup_id=f.id AND booked.patient_id=f.patient_id AND booked.status IN ('pending','confirmed','rescheduled','in-progress') LIMIT 1) AS booked_appointment_id
    FROM consultation_followups f JOIN consultations c ON c.id=f.consultation_id AND c.patient_id=f.patient_id
    JOIN appointments a ON a.id=f.appointment_id AND a.patient_id=f.patient_id AND a.branch_id=f.branch_id
    JOIN doctors d ON d.id=f.doctor_id JOIN clinic_branches b ON b.id=f.branch_id
    WHERE f.patient_id=? AND f.status='active' AND c.status='finalized' AND a.status='completed'
    ORDER BY f.return_date DESC,f.id DESC LIMIT 300`,[req.user.id])
  res.json(rows)
}

async function lockPatientFollowup(id,patientId,conn) {
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0) throw invalid('Invalid follow-up recommendation.')
  const [[row]]=await conn.query(`SELECT f.id FROM consultation_followups f
    JOIN consultations c ON c.id=f.consultation_id AND c.patient_id=f.patient_id
    JOIN appointments a ON a.id=f.appointment_id AND a.patient_id=f.patient_id
    WHERE f.id=? AND f.patient_id=? AND f.status='active' AND c.status='finalized' AND a.status='completed' FOR UPDATE`,[id,patientId])
  if(!row) throw invalid('Recommendation not found for your account.',404)
  const [[booked]]=await conn.query(`SELECT a.id FROM appointment_followup_links l JOIN appointments a ON a.id=l.appointment_id
    WHERE l.followup_id=? AND a.patient_id=? AND a.status IN ('pending','confirmed','rescheduled','in-progress') LIMIT 1`,[id,patientId])
  if(booked) throw invalid('You already have an active appointment linked to this recommendation.',409)
  return row
}

module.exports = { normalizeFollowup, readFollowup, saveFollowup, updateDoctorFollowup, listPatientFollowups, lockPatientFollowup }
