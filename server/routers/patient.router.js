const express    = require('express')
const router     = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  register, login, checkAuth, logout,
  getAppointments, getHistory,
  createAppointment, cancelAppointment, rescheduleAppointment,
  getDoctors, getDoctorSchedule
} = require('../controllers/patient.controller')

router.post('/register', register)
router.post('/login',    login)
router.get('/auth/check', checkAuth)
router.post('/logout',   logout)

// Protected patient routes
router.use(verifyToken, requireRole('patient'))

router.get('/appointments',                        getAppointments)
router.post('/appointments',                       createAppointment)
router.get('/appointments/history',                getHistory)
router.patch('/appointments/:id/cancel',           cancelAppointment)
router.patch('/appointments/:id/reschedule',       rescheduleAppointment)
router.get('/doctors',                             getDoctors)
router.get('/doctors/:id/schedule',                getDoctorSchedule)

module.exports = router