// server/routers/staff.router.js
const express    = require('express')
const router     = express.Router()
const staffCtrl  = require('../controllers/staff.controller')
const commonCtrl = require('../controllers/common.controller')
const authenticate = require('../middlewares/auth.middleware')
const requireRole  = require('../middlewares/role.middleware')
const requirePasswordChangeCompleted = require('../middlewares/passwordChange.middleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')

const baseAuth = [authenticate('staff_token'), requireRole('staff')]
const auth = [...baseAuth, requirePasswordChangeCompleted]

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/login',     loginLimiter, staffCtrl.login)
router.get('/check-auth', staffCtrl.checkAuth)
router.post('/logout',    staffCtrl.logout)
router.post('/security/password/required', ...baseAuth, commonCtrl.completeRequiredPasswordChange)
router.post('/security/password/request-code', otpRequestLimiter, ...auth, commonCtrl.requestMyPasswordCode)
router.post('/security/password/change', otpVerifyLimiter, ...auth, commonCtrl.changeMyPassword)
router.get('/notifications', ...auth, commonCtrl.listNotifications)
router.patch('/notifications/read-all', ...auth, commonCtrl.readAllNotifications)
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
router.patch('/appointments/:id/no-show',    ...auth, staffCtrl.markAppointmentNoShow)
router.patch('/appointments/:id/reschedule', ...auth, staffCtrl.rescheduleAppointment)

// ── Queue ─────────────────────────────────────────────────────────────────────
router.get('/queue',              ...auth, staffCtrl.getQueue)
router.get('/queue/precheck/:patientId', ...auth, staffCtrl.getQueuePrecheck)
router.post('/queue',             ...auth, staffCtrl.addToQueue)
router.patch('/queue/:id/status', ...auth, staffCtrl.updateQueueStatus)

// ── Patients ──────────────────────────────────────────────────────────────────
router.get('/patients',     ...auth, staffCtrl.getPatients)
router.post('/patients/walk-in', ...auth, staffCtrl.createWalkInPatient)
router.get('/patients/:id', ...auth, staffCtrl.getPatientRecord)
router.get('/billing', ...auth, staffCtrl.getBills)
router.get('/billing/catalog', ...auth, staffCtrl.getBillingCatalogForStaff)
router.get('/billing/discount-presets', ...auth, staffCtrl.getDiscountPresets)
router.get('/billing/:id/adjustment-requests', ...auth, staffCtrl.getBillingAdjustmentRequests)
router.post('/billing/:id/adjustment-requests', ...auth, staffCtrl.requestBillingAdjustment)
router.post('/billing/cashier-close', ...auth, staffCtrl.closeCashierShift)
router.get('/billing/:id', ...auth, staffCtrl.getBillById)
router.put('/billing/:id', ...auth, staffCtrl.updateBill)
router.post('/billing/:id/finalize', ...auth, staffCtrl.finalizeBill)
router.post('/billing/:id/pay', ...auth, staffCtrl.payBill)
router.post('/billing/:id/confirm-payment', ...auth, staffCtrl.confirmBillPayment)
router.get('/billing-payment-settings', ...auth, staffCtrl.getPaymentSettingsForStaff)

// ── Inventory ─────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, staffCtrl.getInventory)
router.post('/inventory',             ...auth, staffCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, staffCtrl.updateStock)
// FIX 2: Edit and Delete inventory items
router.put('/inventory/:id',          ...auth, staffCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, staffCtrl.deleteInventoryItem)

// ── Doctors list ──────────────────────────────────────────────────────────────
router.get('/doctors', ...auth, staffCtrl.getDoctors)
router.get('/doctors/:id/schedules', ...auth, staffCtrl.getDoctorSchedules)
router.get('/doctors/:id/unavailable-dates', ...auth, staffCtrl.getDoctorUnavailableDatesForStaff)

// ── Supply Requests ───────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, staffCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, staffCtrl.resolveSupplyRequest)

module.exports = router
