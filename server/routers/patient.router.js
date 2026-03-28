// server/routers/patient.router.js
// FIX #3 — Added POST /register/verify route

const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  register, verifyRegistration, login, checkAuth, logout,
  getAppointments, getHistory,
  createAppointment, cancelAppointment, rescheduleAppointment,
  getDoctors, getDoctorSchedule,
} = require('../controllers/patient.controller')

// Public
router.post('/register',        register)
router.post('/register/verify', verifyRegistration)  // FIX #3 — new verification step
router.post('/login',           login)
router.get('/check-auth',       checkAuth)           // FIXED ROUTE
router.post('/logout',          logout)

// Protected
router.use(verifyToken('patient_token'), requireRole('patient')) // FIXED MIDDLEWARE
router.get('/appointments',                        getAppointments)
router.post('/appointments',                       createAppointment)
router.get('/appointments/history',                getHistory)
router.patch('/appointments/:id/cancel',           cancelAppointment)
router.patch('/appointments/:id/reschedule',       rescheduleAppointment)
router.get('/doctors',                             getDoctors)
router.get('/doctors/:id/schedule',                getDoctorSchedule)

module.exports = router