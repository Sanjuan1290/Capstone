const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getDailyAppointments, startConsultation,
  saveConsultation, getPatientHistory,
  getInventoryItems, getMyRequests, submitRequest,
  getMySchedule
} = require('../controllers/doctor.controller')

router.post('/login',     login)
router.get('/check-auth', checkAuth) // FIXED ROUTE
router.post('/logout',    logout)

router.use(verifyToken('doctor_token'), requireRole('doctor')) // FIXED MIDDLEWARE

router.get('/dashboard',                          getDashboard)
router.get('/appointments/daily',                 getDailyAppointments)
router.patch('/appointments/:id/start',           startConsultation)
router.post('/consultations/:appointmentId',      saveConsultation)
router.get('/patients/:id/history',              getPatientHistory)
router.get('/inventory',                          getInventoryItems)
router.get('/requests',                           getMyRequests)
router.post('/requests',                          submitRequest)
router.get('/schedule',                           getMySchedule)

module.exports = router