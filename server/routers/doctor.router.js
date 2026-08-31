// server/routers/doctor.router.js
const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const requirePasswordChangeCompleted = require('../middlewares/passwordChange.middleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getConsultation, updateConsultation, addConsultationAmendment,
  getPatientHistory, getBillingCatalog, getClinicalUploadSignature,
  getInventoryItems, getMyRequests, getRequestLocations, submitRequest,
  getMyQueue, callNext, markQueueDone,
  getMySchedule, getMyScheduleAll, saveMyScheduleDay,
  getMyUnavailableDates, saveMyUnavailableDate, deleteMyUnavailableDate,
} = require('../controllers/doctor.controller')
const commonCtrl = require('../controllers/common.controller')

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',     loginLimiter, login)
router.get('/check-auth', checkAuth)
router.post('/logout',    logout)

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(verifyToken('doctor_token'), requireRole('doctor'))
router.post('/security/password/required', commonCtrl.completeRequiredPasswordChange)
router.use(requirePasswordChangeCompleted)
router.post('/security/password/request-code', otpRequestLimiter, commonCtrl.requestMyPasswordCode)
router.post('/security/password/change', otpVerifyLimiter, commonCtrl.changeMyPassword)

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
router.post('/consultations/:appointmentId/amendments', addConsultationAmendment)
router.get('/billing/catalog',                 getBillingCatalog)
router.post('/uploads/clinical/signature',          getClinicalUploadSignature)

router.get('/patients/:id/history',          getPatientHistory)
router.get('/inventory',                     getInventoryItems)
router.get('/requests',                      getMyRequests)
router.get('/inventory/locations',            getRequestLocations)
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
router.get('/schedule/unavailable-dates',      getMyUnavailableDates)
router.put('/schedule/unavailable-dates',      saveMyUnavailableDate)
router.delete('/schedule/unavailable-dates/:date', deleteMyUnavailableDate)

module.exports = router


