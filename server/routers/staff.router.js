const express    = require('express')
const router     = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getInventory, updateStock,
  getDoctors, addInventoryItem
} = require('../controllers/staff.controller')

router.post('/login',    login)
router.get('/auth/check', checkAuth)
router.post('/logout',   logout)

router.use(verifyToken, requireRole('staff'))

router.get('/dashboard',                     getDashboard)
router.get('/appointments',                  getAppointments)
router.patch('/appointments/:id/confirm',    confirmAppointment)
router.patch('/appointments/:id/cancel',     cancelAppointment)
router.get('/queue',                         getQueue)
router.post('/queue',                        addToQueue)
router.patch('/queue/:id/status',            updateQueueStatus)
router.get('/patients',                      getPatients)
router.get('/patients/:id',                  getPatientRecord)
router.get('/inventory',                     getInventory)
router.patch('/inventory/:id/stock',         updateStock)
router.get('/doctors',                       getDoctors)
router.post('/inventory', addInventoryItem)
module.exports = router