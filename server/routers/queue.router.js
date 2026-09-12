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

const issueDisplaySession = (res) => {
  const ttlMs = getDisplayTtlMs()
  const token = jwt.sign(
    { role: DISPLAY_ROLE, purpose: 'waiting_room_queue' },
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
    if (decoded.role !== DISPLAY_ROLE || decoded.purpose !== 'waiting_room_queue') {
      throw new Error('Invalid display session.')
    }
    req.queueDisplay = decoded
    return next()
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/api/queue' })
    return res.status(401).json({ code: 'QUEUE_DISPLAY_LOCKED', message: 'Queue display session expired. Enter the display PIN again.' })
  }
}

router.post('/display/unlock', queueDisplayLimiter, (req, res) => {
  const expectedPin = getDisplayPin()
  if (!expectedPin) {
    return res.status(503).json({ code: 'QUEUE_DISPLAY_NOT_CONFIGURED', message: 'Queue display PIN is not configured.' })
  }
  if (!safeEqual(req.body?.pin, expectedPin)) {
    return res.status(401).json({ code: 'INVALID_QUEUE_DISPLAY_PIN', message: 'Incorrect display PIN.' })
  }
  issueDisplaySession(res)
  return res.json({ message: 'Queue display unlocked.' })
})

router.post('/display/lock', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/api/queue' })
  res.json({ message: 'Queue display locked.' })
})

router.get('/live', requireDisplaySession, async (req, res) => {
  const today = getTodayDateOnly()

  // Public-facing data intentionally excludes patient names and contact details.
  const [servingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.type,
            d.full_name AS doctor,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ? AND q.status = 'in-progress'
     ORDER BY q.queue_number ASC
     LIMIT 1`,
    [today]
  )

  const [waitingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.type,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     WHERE q.queue_date = ? AND q.status = 'waiting'
     ORDER BY q.queue_number ASC`,
    [today]
  )

  const clinicOpen = isClinicOpenDate(today)

  res.setHeader('Cache-Control', 'no-store')
  res.json({
    serving: servingRows[0] || null,
    waiting: waitingRows,
    clinicOpen,
  })
})

module.exports = router



