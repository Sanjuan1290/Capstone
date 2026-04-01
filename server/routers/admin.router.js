// server/routers/admin.router.js
const express    = require('express')
const router     = express.Router()
const adminCtrl  = require('../controllers/admin.controller')
const authenticate = require('../middlewares/auth.middleware')
const requireRole  = require('../middlewares/role.middleware')

const auth = [authenticate('admin_token'), requireRole('admin')]

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/login',      adminCtrl.login)
router.get('/check-auth',  adminCtrl.checkAuth)
router.post('/logout',     adminCtrl.logout)

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard',   ...auth, adminCtrl.getDashboard)

// ── Appointments ──────────────────────────────────────────────────────────────
router.get('/appointments',                    ...auth, adminCtrl.getAppointments)
router.post('/appointments',                   ...auth, adminCtrl.createAppointment)
router.patch('/appointments/:id/confirm',      ...auth, adminCtrl.confirmAppointment)
router.patch('/appointments/:id/cancel',       ...auth, adminCtrl.cancelAppointment)
router.patch('/appointments/:id/reschedule',   ...auth, adminCtrl.rescheduleAppointment)

// ── Queue ─────────────────────────────────────────────────────────────────────
router.get('/queue',              ...auth, adminCtrl.getQueue)
router.post('/queue',             ...auth, adminCtrl.addToQueue)
router.patch('/queue/:id/status', ...auth, adminCtrl.updateQueueStatus)

// ── Patients ──────────────────────────────────────────────────────────────────
router.get('/patients',     ...auth, adminCtrl.getPatients)
router.get('/patients/:id', ...auth, adminCtrl.getPatientRecord)

// ── Staff ─────────────────────────────────────────────────────────────────────
router.get('/staff',              ...auth, adminCtrl.getStaff)
router.post('/staff',             ...auth, adminCtrl.createStaff)
router.patch('/staff/:id/toggle', ...auth, adminCtrl.toggleStaff)

// ── Doctors ───────────────────────────────────────────────────────────────────
router.get('/doctors',                    ...auth, adminCtrl.getDoctors)
router.post('/doctors',                   ...auth, adminCtrl.createDoctor)
router.patch('/doctors/:id/toggle',       ...auth, adminCtrl.toggleDoctor)
router.get('/doctors/:id/schedules',      ...auth, adminCtrl.getDoctorSchedules)
router.put('/doctors/:id/schedules',      ...auth, adminCtrl.saveDaySchedule)

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', ...auth, adminCtrl.getReports)

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, adminCtrl.getInventory)
router.post('/inventory',             ...auth, adminCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, adminCtrl.updateStock)
// FIX 5: Edit and Delete inventory items
router.put('/inventory/:id',          ...auth, adminCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, adminCtrl.deleteInventoryItem)

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, adminCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, adminCtrl.resolveSupplyRequest)

module.exports = router