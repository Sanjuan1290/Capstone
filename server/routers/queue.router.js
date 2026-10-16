// server/routers/queue.router.js
// Waiting-room display API. The route is reachable without a staff/admin session,
// but queue data is protected by a dedicated short-lived display session.

const crypto = require('crypto')
const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router()
const db = require('../db/connect')
const { queueDisplayLimiter } = require('../middlewares/rateLimit.middleware')
const { getTodayDateOnly, isClinicOpenDate } = require('../utils/date')

const COOKIE_NAME = 'queue_display_token'
const DISPLAY_ROLE = 'queue_display'
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const getDisplayPin = () => {
  const configured = String(process.env.QUEUE_DISPLAY_PIN || '').trim()
  if (configured) return configured
  // Local-only fallback keeps development usable, while production validation
  // requires an explicit non-default PIN.
  return process.env.NODE_ENV === 'production' ? '' : '123456'
}

const getDisplayTtlMs = () => {
  const hours = Number(process.env.QUEUE_DISPLAY_SESSION_HOURS || 12)
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_MS
  return Math.min(hours, 24) * 60 * 60 * 1000
}

const issueDisplaySession = (res, branch) => {
  const ttlMs = getDisplayTtlMs()
  const token = jwt.sign(
    { role: DISPLAY_ROLE, purpose: 'waiting_room_queue', branch_id: Number(branch.id), branch_name: branch.name },
    process.env.JWT_SECRET,
    { expiresIn: Math.floor(ttlMs / 1000) }
  )
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/api/queue',
    maxAge: ttlMs,
  })
}

const requireDisplaySession = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    return res.status(401).json({ code: 'QUEUE_DISPLAY_LOCKED', message: 'Queue display is locked.' })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== DISPLAY_ROLE || decoded.purpose !== 'waiting_room_queue' || !Number.isSafeInteger(Number(decoded.branch_id)) || Number(decoded.branch_id) <= 0) {
      throw new Error('Invalid display session.')
    }
    req.queueDisplay = decoded
    return next()
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/api/queue' })
    return res.status(401).json({ code: 'QUEUE_DISPLAY_LOCKED', message: 'Queue display session expired. Enter the display PIN again.' })
  }
}

// Branches are public clinic locations, but queue details require a PIN-bound session.
router.get('/display/branches', async (req, res) => {
  const [rows] = await db.query('SELECT id, name FROM clinic_branches WHERE is_active=1 ORDER BY name, id')
  res.setHeader('Cache-Control', 'no-store')
  res.json(rows)
})

router.post('/display/unlock', queueDisplayLimiter, async (req, res) => {
  const expectedPin = getDisplayPin()
  if (!expectedPin) {
    return res.status(503).json({ code: 'QUEUE_DISPLAY_NOT_CONFIGURED', message: 'Queue display PIN is not configured.' })
  }
  if (!safeEqual(req.body?.pin, expectedPin)) {
    return res.status(401).json({ code: 'INVALID_QUEUE_DISPLAY_PIN', message: 'Incorrect display PIN.' })
  }
  const branchId = Number(req.body?.branch_id)
  if (!Number.isSafeInteger(branchId) || branchId <= 0) return res.status(400).json({ message: 'Choose a clinic branch.' })
  const [[branch]] = await db.query('SELECT id,name FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1', [branchId])
  if (!branch) return res.status(404).json({ code: 'BRANCH_NOT_FOUND', message: 'The selected clinic branch is unavailable.' })
  issueDisplaySession(res, branch)
  return res.json({ message: 'Queue display unlocked.', branch_name: branch.name })
})

router.post('/display/lock', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/api/queue' })
  res.json({ message: 'Queue display locked.' })
})

router.get('/live', requireDisplaySession, async (req, res) => {
  const branchId = Number(req.queueDisplay.branch_id)
  const [[branch]] = await db.query('SELECT id,name FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1', [branchId])
  if (!branch) return res.status(403).json({ code: 'BRANCH_INACTIVE', message: 'This clinic branch is no longer available. Choose another branch.' })
  const today = getTodayDateOnly()

  // Public-facing data intentionally excludes patient names and contact details.
  const [servingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.type,
            d.full_name AS doctor,
            TIME_FORMAT(q.called_at, '%h:%i %p') AS calledAt,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     JOIN doctors d ON q.doctor_id = d.id
     WHERE q.branch_id = ? AND d.branch_id = q.branch_id AND q.queue_date = ? AND q.status = 'called'
     ORDER BY q.queue_number ASC
     LIMIT 1`,
    [branchId, today]
  )

  const [waitingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.type,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     WHERE q.branch_id = ? AND q.queue_date = ? AND q.status = 'waiting'
     ORDER BY q.queue_number ASC`,
    [branchId, today]
  )

  const clinicOpen = isClinicOpenDate(today)

  res.setHeader('Cache-Control', 'no-store')
  res.json({
    serving: servingRows[0] || null,
    waiting: waitingRows,
    clinicOpen,
    branch_id: branchId,
    branch_name: branch.name,
  })
})

module.exports = router



