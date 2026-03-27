const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const {
  login, checkAuth, logout,
  getDashboard, getAppointments, confirmAppointment, cancelAppointment,
  getQueue, addToQueue, updateQueueStatus,
  getPatients, getPatientRecord,
  getInventory, updateStock,
  getDoctors, addInventoryItem,
  // ✅ NEW: supply request handlers
  getSupplyRequests, resolveSupplyRequest,
} = require('../controllers/staff.controller')

// Public
router.post('/login',     login)
router.get('/auth/check', checkAuth)
router.post('/logout',    logout)

// Protected — all routes below require staff token
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
router.post('/inventory',                    addInventoryItem)

// ✅ NEW: Supply requests routes
router.get('/supply-requests',               getSupplyRequests)
router.patch('/supply-requests/:id',         resolveSupplyRequest)

module.exports = router