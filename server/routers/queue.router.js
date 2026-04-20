// server/routers/queue.router.js
// FIX #7 — Public live queue endpoint for the QueueDisplay TV screen.
// No auth required — this is shown on a public display monitor.
//
// Register in server.js:
//   const queueRouter = require('./routers/queue.router')
//   app.use('/api/queue', queueRouter)

const express = require('express')
const router  = express.Router()
const db      = require('../db/connect')
const { getTodayDateOnly } = require('../utils/date')

router.get('/live', async (req, res) => {
  const today = getTodayDateOnly()

  // Patient currently being served
  const [servingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.patient_name AS patient,
            q.type,
            d.full_name    AS doctor,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     JOIN doctors d ON q.doctor_id = d.id
     WHERE q.queue_date = ? AND q.status = 'in-progress'
     ORDER BY q.queue_number ASC
     LIMIT 1`,
    [today]
  )

  // All waiting patients
  const [waitingRows] = await db.query(
    `SELECT q.queue_number AS queueNo,
            q.patient_name AS patient,
            q.type,
            TIME_FORMAT(q.arrived_at, '%h:%i %p') AS arrivedAt
     FROM queue q
     WHERE q.queue_date = ? AND q.status = 'waiting'
     ORDER BY q.queue_number ASC`,
    [today]
  )

  // Clinic open Mon–Sat
  const dayOfWeek = new Date().getDay()
  const clinicOpen = dayOfWeek >= 1 && dayOfWeek <= 6

  res.json({
    serving:    servingRows[0] || null,
    waiting:    waitingRows,
    clinicOpen,
  })
})

module.exports = router
