const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getStaff, createStaff, toggleStaff,
  getDoctors, createDoctor, toggleDoctor,
  getDoctorSchedules, saveDaySchedule,
  getReports,
  getInventory, updateStock, addInventoryItem,
  getSupplyRequests, resolveSupplyRequest,
} = require('../controllers/admin.controller')

router.post('/login',     login)
router.get('/auth/check', checkAuth)
router.post('/logout',    logout)

router.use(verifyToken, requireRole('admin'))

router.get('/dashboard',                       getDashboard)
router.get('/appointments',                    getAppointments)
router.patch('/appointments/:id/confirm',      confirmAppointment)
router.patch('/appointments/:id/cancel',       cancelAppointment)
router.get('/staff',                           getStaff)
router.post('/staff',                          createStaff)
router.patch('/staff/:id/toggle',              toggleStaff)
router.get('/doctors',                         getDoctors)
router.post('/doctors',                        createDoctor)
router.patch('/doctors/:id/toggle',            toggleDoctor)
router.get('/doctors/:id/schedules',           getDoctorSchedules)
router.put('/doctors/:id/schedules',           saveDaySchedule)
router.get('/reports',                         getReports)
router.get('/inventory',                       getInventory)
router.post('/inventory',                      addInventoryItem)
router.patch('/inventory/:id/stock',           updateStock)
router.get('/supply-requests',                 getSupplyRequests)
router.patch('/supply-requests/:id',           resolveSupplyRequest)

module.exports = router