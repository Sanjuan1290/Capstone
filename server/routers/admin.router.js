// server/routers/admin.router.js
const express    = require('express')
const router     = express.Router()
const adminCtrl  = require('../controllers/admin.controller')
const staffCtrl  = require('../controllers/staff.controller')
const commonCtrl = require('../controllers/common.controller')
const authenticate = require('../middlewares/auth.middleware')
const requireRole  = require('../middlewares/role.middleware')

const auth = [authenticate('admin_token'), requireRole('admin')]

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/login',      adminCtrl.login)
router.get('/check-auth',  adminCtrl.checkAuth)
router.post('/logout',     adminCtrl.logout)
router.get('/notifications', ...auth, commonCtrl.listNotifications)
router.patch('/notifications/read-all', ...auth, commonCtrl.readAllNotifications)
router.patch('/notifications/:id/read', ...auth, commonCtrl.readNotification)
router.get('/settings', ...auth, commonCtrl.getMySettings)
router.put('/settings', ...auth, commonCtrl.saveMySettings)
router.get('/landing-page', ...auth, commonCtrl.getAdminLandingPage)
router.put('/landing-page', ...auth, commonCtrl.saveAdminLandingPage)

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard',   ...auth, adminCtrl.getDashboard)

// ── Appointments ──────────────────────────────────────────────────────────────
router.get('/appointments',                    ...auth, adminCtrl.getAppointments)
router.post('/appointments',                   ...auth, adminCtrl.createAppointment)
router.get('/appointment-reasons',             ...auth, adminCtrl.getAppointmentReasonOptions)
router.post('/appointment-reasons',            ...auth, adminCtrl.createAppointmentReasonOption)
router.put('/appointment-reasons/:reasonId',   ...auth, adminCtrl.updateAppointmentReasonOption)
router.delete('/appointment-reasons/:reasonId',...auth, adminCtrl.deleteAppointmentReasonOption)
router.patch('/appointments/:id/confirm',      ...auth, adminCtrl.confirmAppointment)
router.patch('/appointments/:id/cancel',       ...auth, adminCtrl.cancelAppointment)
router.patch('/appointments/:id/no-show',      ...auth, adminCtrl.markAppointmentNoShow)
router.patch('/appointments/:id/reschedule',   ...auth, adminCtrl.rescheduleAppointment)

// ── Queue ─────────────────────────────────────────────────────────────────────
router.get('/queue',              ...auth, adminCtrl.getQueue)
router.get('/queue/precheck/:patientId', ...auth, adminCtrl.getQueuePrecheck)
router.post('/queue',             ...auth, adminCtrl.addToQueue)
router.patch('/queue/:id/status', ...auth, adminCtrl.updateQueueStatus)

// ── Patients ──────────────────────────────────────────────────────────────────
router.get('/patients',     ...auth, adminCtrl.getPatients)
router.post('/patients/walk-in', ...auth, adminCtrl.createWalkInPatient)
router.get('/patients/:id', ...auth, adminCtrl.getPatientRecord)

// ── Staff ─────────────────────────────────────────────────────────────────────
router.get('/staff',              ...auth, adminCtrl.getStaff)
router.post('/staff',             ...auth, adminCtrl.createStaff)
router.patch('/staff/:id/toggle', ...auth, adminCtrl.toggleStaff)
router.put('/staff/:id',          ...auth, adminCtrl.updateStaff)

// ── Doctors ───────────────────────────────────────────────────────────────────
router.get('/doctors',                    ...auth, adminCtrl.getDoctors)
router.post('/doctors',                   ...auth, adminCtrl.createDoctor)
router.patch('/doctors/:id/toggle',       ...auth, adminCtrl.toggleDoctor)
router.put('/doctors/:id',                ...auth, adminCtrl.updateDoctor)
router.get('/doctors/:id/schedules',      ...auth, adminCtrl.getDoctorSchedules)
router.put('/doctors/:id/schedules',      ...auth, adminCtrl.saveDaySchedule)
router.get('/doctors/:id/unavailable-dates', ...auth, adminCtrl.getDoctorUnavailableDatesAdmin)
router.put('/doctors/:id/unavailable-dates', ...auth, adminCtrl.saveDoctorUnavailableDateAdmin)
router.delete('/doctors/:id/unavailable-dates/:date', ...auth, adminCtrl.deleteDoctorUnavailableDateAdmin)

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/billing', ...auth, staffCtrl.getBills)
router.get('/billing/reconciliation', ...auth, adminCtrl.getBillingReconciliation)
router.get('/billing/discount-presets', ...auth, adminCtrl.getDiscountPresetsAdmin)
router.post('/billing/discount-presets', ...auth, adminCtrl.saveDiscountPresetAdmin)
router.put('/billing/discount-presets/:id', ...auth, adminCtrl.saveDiscountPresetAdmin)
router.post('/billing/payments/:paymentId/void', ...auth, adminCtrl.voidBillingPayment)
router.post('/billing/payments/:paymentId/refund', ...auth, adminCtrl.refundBillingPayment)
router.get('/billing/catalog', ...auth, adminCtrl.getBillingCatalogAdmin)
router.post('/billing/catalog', ...auth, adminCtrl.createBillingCatalogService)
router.put('/billing/catalog/:serviceId', ...auth, adminCtrl.updateBillingCatalogService)
router.delete('/billing/catalog/:serviceId', ...auth, adminCtrl.deleteBillingCatalogService)
router.get('/billing/payment-settings', ...auth, adminCtrl.getPaymentSettingsAdmin)
router.put('/billing/payment-settings', ...auth, adminCtrl.updatePaymentSettingsAdmin)
router.get('/billing/:id', ...auth, staffCtrl.getBillById)
router.get('/reports', ...auth, adminCtrl.getReports)
router.get('/audit-logs', ...auth, adminCtrl.getAuditLogs)
router.get('/clinic-settings', ...auth, adminCtrl.getClinicSettingsAdmin)
router.put('/clinic-settings', ...auth, adminCtrl.updateClinicSettingsAdmin)

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, adminCtrl.getInventory)
router.get('/inventory/logs',         ...auth, adminCtrl.getInventoryLogs)
router.post('/inventory',             ...auth, adminCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, adminCtrl.updateStock)
// FIX 5: Edit and Delete inventory items
router.put('/inventory/:id',          ...auth, adminCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, adminCtrl.deleteInventoryItem)

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, adminCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, adminCtrl.resolveSupplyRequest)

module.exports = router


