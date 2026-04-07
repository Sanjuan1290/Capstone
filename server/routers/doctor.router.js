// server/routers/doctor.router.js
const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getPatientHistory,
  getInventoryItems, getMyRequests, submitRequest,
  getMySchedule, getMyScheduleAll, saveMyScheduleDay,
} = require('../controllers/doctor.controller')

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',     login)
router.get('/check-auth', checkAuth)
router.post('/logout',    logout)

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(verifyToken('doctor_token'), requireRole('doctor'))

router.get('/dashboard',                     getDashboard)
router.get('/appointments/daily',            getDailyAppointments)
router.patch('/appointments/:id/start',      startConsultation)
router.post('/consultations/:appointmentId', saveConsultation)
router.get('/patients/:id/history',          getPatientHistory)
router.get('/inventory',                     getInventoryItems)
router.get('/requests',                      getMyRequests)
router.post('/requests',                     submitRequest)

// ── Doctor's own schedule ─────────────────────────────────────────────────────
// GET /schedule      → active days only (used by dashboard / booking)
// GET /schedule/all  → all days including inactive (used by Doctor_Schedule page)
// PUT /schedule      → save one day (doctor can only edit their own, req.user.id enforced)
router.get('/schedule',     getMySchedule)
router.get('/schedule/all', getMyScheduleAll)
router.put('/schedule',     saveMyScheduleDay)

module.exports = router