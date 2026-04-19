// server/routers/doctor.router.js
const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getConsultation, updateConsultation,
  getPatientHistory,
  getInventoryItems, getMyRequests, submitRequest,
  getMyQueue, callNext, markQueueDone,
  getMySchedule, getMyScheduleAll, saveMyScheduleDay,
} = require('../controllers/doctor.controller')
const commonCtrl = require('../controllers/common.controller')

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',     login)
router.get('/check-auth', checkAuth)
router.post('/logout',    logout)

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(verifyToken('doctor_token'), requireRole('doctor'))

router.get('/notifications',                commonCtrl.listNotifications)
router.patch('/notifications/read-all',     commonCtrl.readAllNotifications)
router.patch('/notifications/:id/read',    commonCtrl.readNotification)
router.get('/settings',                     commonCtrl.getMySettings)
router.put('/settings',                     commonCtrl.saveMySettings)
router.get('/dashboard',                     getDashboard)
router.get('/appointments/daily',            getDailyAppointments)
router.patch('/appointments/:id/start',      startConsultation)

// Consultation — save (new) or get/update (existing/completed)
router.post('/consultations/:appointmentId',   saveConsultation)
router.get('/consultations/:appointmentId',    getConsultation)
router.patch('/consultations/:appointmentId',  updateConsultation)

router.get('/patients/:id/history',          getPatientHistory)
router.get('/inventory',                     getInventoryItems)
router.get('/requests',                      getMyRequests)
router.post('/requests',                     submitRequest)

// ── Doctor Queue Control ───────────────────────────────────────────────────────
// NOTE: /queue/call-next MUST be before /queue/:id/done so Express doesn't
// treat "call-next" as an :id param.
router.get('/queue',              getMyQueue)
router.patch('/queue/call-next',  callNext)
router.patch('/queue/:id/done',   markQueueDone)

// ── Doctor's Own Schedule ─────────────────────────────────────────────────────
router.get('/schedule',     getMySchedule)
router.get('/schedule/all', getMyScheduleAll)
router.put('/schedule',     saveMyScheduleDay)

module.exports = router
