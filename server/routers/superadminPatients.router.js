'use strict'

const express = require('express')
const db = require('../db/connect')
const authenticate = require('../middlewares/auth.middleware')
const { writeAuditLog } = require('../utils/audit')
const {
  parseDirectoryPagination,
  buildPatientDirectoryWhere,
  parseBanState,
} = require('../utils/superadminPatientDirectory')

const router = express.Router()

// This router is intentionally Super Admin only. It is not branch-scoped because
// the directory is a system-wide view of registered patient accounts.
router.use(authenticate('superadmin_token'))

const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0

router.get('/', async (req, res) => {
  const { page, pageSize, offset } = parseDirectoryPagination(req.query.page, req.query.page_size)
  const search = String(req.query.search || '').trim().slice(0, 100)
  const status = ['all', 'active', 'banned'].includes(String(req.query.status || 'all'))
    ? String(req.query.status || 'all')
    : 'all'
  const { whereSql, params } = buildPatientDirectoryWhere({ search, status })

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM patients p WHERE ${whereSql}`,
    params,
  )
  const [[summary]] = await db.query(
    `SELECT
       COUNT(*) AS total_registered,
       COALESCE(SUM(COALESCE(p.is_banned, 0) = 0), 0) AS active_accounts,
       COALESCE(SUM(COALESCE(p.is_banned, 0) = 1), 0) AS banned_accounts,
       (SELECT COUNT(*) FROM appointments a
        JOIN patients registered ON registered.id = a.patient_id
        WHERE COALESCE(registered.is_walk_in, 0) = 0 AND a.status = 'no_show') AS total_no_shows
     FROM patients p
     WHERE COALESCE(p.is_walk_in, 0) = 0`,
  )
  const [items] = await db.query(
    `SELECT
       p.id,
       p.full_name,
       p.phone,
       p.email,
       COALESCE(p.is_banned, 0) AS is_banned,
       p.created_at,
       (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS total_appointments,
       (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'no_show') AS no_show_count
     FROM patients p
     WHERE ${whereSql}
     ORDER BY p.full_name ASC, p.id ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  const total = Number(countRow?.total || 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  res.set('Cache-Control', 'no-store')
  return res.json({
    items,
    summary: {
      total_registered: Number(summary?.total_registered || 0),
      active_accounts: Number(summary?.active_accounts || 0),
      banned_accounts: Number(summary?.banned_accounts || 0),
      total_no_shows: Number(summary?.total_no_shows || 0),
    },
    pagination: { page, page_size: pageSize, total, total_pages: totalPages },
    filters: { search, status },
  })
})

router.get('/:patientId', async (req, res) => {
  if (!validId(req.params.patientId)) {
    return res.status(400).json({ code: 'INVALID_PATIENT_ID', message: 'Select a valid patient account.' })
  }

  const patientId = Number(req.params.patientId)
  const [[patient]] = await db.query(
    `SELECT
       p.id, p.full_name, p.phone, p.email,
       COALESCE(NULLIF(p.gender, ''), p.sex) AS gender,
       p.address, p.created_at,
       COALESCE(p.is_banned, 0) AS is_banned,
       p.banned_at,
       (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS total_appointments,
       (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'completed') AS completed_appointments,
       (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'no_show') AS no_show_count
     FROM patients p
     WHERE p.id = ? AND COALESCE(p.is_walk_in, 0) = 0
     LIMIT 1`,
    [patientId],
  )

  if (!patient) return res.status(404).json({ code: 'PATIENT_NOT_FOUND', message: 'Registered patient account not found.' })

  const { page, pageSize, offset } = parseDirectoryPagination(req.query.history_page, req.query.history_page_size || 10)
  const [[historyCount]] = await db.query(
    'SELECT COUNT(*) AS total FROM appointments WHERE patient_id = ?',
    [patientId],
  )
  const [historyItems] = await db.query(
    `SELECT
       a.id, a.appointment_date, a.appointment_time, a.clinic_type,
       a.status, a.appointment_source,
       COALESCE(NULLIF(a.requested_service_name_snapshot, ''), catalog.service_name) AS service_name,
       d.full_name AS doctor_name,
       cb.name AS branch_name
     FROM appointments a
     LEFT JOIN doctors d ON d.id = a.doctor_id
     LEFT JOIN clinic_branches cb ON cb.id = a.branch_id
     LEFT JOIN billing_service_catalog catalog ON catalog.id = a.requested_service_id
     WHERE a.patient_id = ?
     ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [patientId, pageSize, offset],
  )

  const totalHistory = Number(historyCount?.total || 0)
  res.set('Cache-Control', 'no-store')
  return res.json({
    patient,
    history: {
      items: historyItems,
      page,
      page_size: pageSize,
      total: totalHistory,
      total_pages: Math.max(1, Math.ceil(totalHistory / pageSize)),
    },
  })
})

router.patch('/:patientId/ban', async (req, res) => {
  if (!validId(req.params.patientId)) {
    return res.status(400).json({ code: 'INVALID_PATIENT_ID', message: 'Select a valid patient account.' })
  }

  let banned
  try {
    banned = parseBanState(req.body?.banned)
  } catch (error) {
    return res.status(error.statusCode || 400).json({ code: error.code || 'INVALID_BAN_STATUS', message: error.message })
  }

  const patientId = Number(req.params.patientId)
  const [[existing]] = await db.query(
    'SELECT id, COALESCE(is_banned, 0) AS is_banned, COALESCE(is_walk_in, 0) AS is_walk_in FROM patients WHERE id = ? LIMIT 1',
    [patientId],
  )
  if (!existing || Number(existing.is_walk_in)) {
    return res.status(404).json({ code: 'PATIENT_NOT_FOUND', message: 'Registered patient account not found.' })
  }

  const wasBanned = Number(existing.is_banned) === 1
  if (wasBanned === banned) {
    return res.json({
      message: banned ? 'This patient account is already banned.' : 'This patient account is already active.',
      patient: { id: patientId, is_banned: wasBanned },
    })
  }

  const [updated] = await db.query(
    `UPDATE patients
     SET is_banned = ?,
         banned_at = ?,
         banned_by_admin_id = ?,
         session_version = COALESCE(session_version, 1) + 1
     WHERE id = ? AND COALESCE(is_banned, 0) = ?`,
    [banned ? 1 : 0, banned ? new Date() : null, banned ? req.user.id : null, patientId, wasBanned ? 1 : 0],
  )
  if (!Number(updated?.affectedRows || 0)) {
    return res.status(409).json({ code: 'PATIENT_STATUS_CHANGED', message: 'This patient account status changed in another session. Refresh the patient details and try again.' })
  }

  await writeAuditLog({
    userId: req.user.id,
    userRole: 'superadmin',
    action: banned ? 'patient.account_banned' : 'patient.account_unbanned',
    entityType: 'patient_account',
    entityId: patientId,
    oldValues: { is_banned: wasBanned },
    newValues: { is_banned: banned },
    ipAddress: req.ip || null,
  }).catch((error) => {
    console.error('[patient-directory] audit write failed', { patientId, action: banned ? 'ban' : 'unban', message: error.message })
  })

  return res.json({
    message: banned
      ? 'Patient account banned. Existing patient sessions have been revoked.'
      : 'Patient account unbanned. The patient can sign in again.',
    patient: { id: patientId, is_banned: banned },
  })
})

module.exports = router
