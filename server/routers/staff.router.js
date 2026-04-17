// server/routers/staff.router.js
const express    = require('express')
const router     = express.Router()
const staffCtrl  = require('../controllers/staff.controller')
const commonCtrl = require('../controllers/common.controller')
const authenticate = require('../middlewares/auth.middleware')
const requireRole  = require('../middlewares/role.middleware')

const auth = [authenticate('staff_token'), requireRole('staff')]

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/login',     staffCtrl.login)
router.get('/check-auth', staffCtrl.checkAuth)
router.post('/logout',    staffCtrl.logout)
router.get('/notifications', ...auth, commonCtrl.listNotifications)
router.patch('/notifications/:id/read', ...auth, commonCtrl.readNotification)
router.get('/settings', ...auth, commonCtrl.getMySettings)
router.put('/settings', ...auth, commonCtrl.saveMySettings)

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard',  ...auth, staffCtrl.getDashboard)

// ── Appointments ──────────────────────────────────────────────────────────────
router.get('/appointments',                  ...auth, staffCtrl.getAppointments)
router.post('/appointments',                 ...auth, staffCtrl.createAppointment)
router.patch('/appointments/:id/confirm',    ...auth, staffCtrl.confirmAppointment)
router.patch('/appointments/:id/cancel',     ...auth, staffCtrl.cancelAppointment)
router.patch('/appointments/:id/reschedule', ...auth, staffCtrl.rescheduleAppointment)

// ── Queue ─────────────────────────────────────────────────────────────────────
router.get('/queue',              ...auth, staffCtrl.getQueue)
router.post('/queue',             ...auth, staffCtrl.addToQueue)
router.patch('/queue/:id/status', ...auth, staffCtrl.updateQueueStatus)

// ── Patients ──────────────────────────────────────────────────────────────────
router.get('/patients',     ...auth, staffCtrl.getPatients)
router.get('/patients/:id', ...auth, staffCtrl.getPatientRecord)

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, staffCtrl.getInventory)
router.post('/inventory',             ...auth, staffCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, staffCtrl.updateStock)
// FIX 2: Edit and Delete inventory items
router.put('/inventory/:id',          ...auth, staffCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, staffCtrl.deleteInventoryItem)

// ── Doctors list ──────────────────────────────────────────────────────────────
router.get('/doctors', ...auth, staffCtrl.getDoctors)

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, staffCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, staffCtrl.resolveSupplyRequest)

module.exports = router
