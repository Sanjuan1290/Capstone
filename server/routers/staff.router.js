// server/routers/staff.router.js
const express    = require('express')
const router     = express.Router()
const staffCtrl  = require('../controllers/staff.controller')
const adminCtrl  = require('../controllers/admin.controller')
const staffAccessCtrl = require('../controllers/staffAccess.controller')
const commonCtrl = require('../controllers/common.controller')
const authenticate = require('../middlewares/auth.middleware')
const requireRole  = require('../middlewares/role.middleware')
const requirePasswordChangeCompleted = require('../middlewares/passwordChange.middleware')
const { requireStaffPermission, requireAnyStaffPermission } = require('../middlewares/staffPermission.middleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')

const baseAuth = [authenticate('staff_token'), requireRole('staff')]
const auth = [...baseAuth, requirePasswordChangeCompleted]
const can = (key) => requireStaffPermission(key)
const canAny = (...keys) => requireAnyStaffPermission(...keys)

// ── Auth / universal account utilities ───────────────────────────────────────
router.post('/login',     loginLimiter, staffCtrl.login)
router.get('/check-auth', staffCtrl.checkAuth)
router.post('/logout',    staffCtrl.logout)
router.post('/security/password/required', ...baseAuth, commonCtrl.completeRequiredPasswordChange)
router.post('/security/password/request-code', ...auth, otpRequestLimiter, commonCtrl.requestMyPasswordCode)
router.post('/security/password/change', ...auth, otpVerifyLimiter, commonCtrl.changeMyPassword)
router.get('/notifications', ...auth, commonCtrl.listNotifications)
router.patch('/notifications/read-all', ...auth, commonCtrl.readAllNotifications)
router.patch('/notifications/:id/read', ...auth, commonCtrl.readNotification)
router.get('/settings', ...auth, commonCtrl.getMySettings)
router.put('/settings', ...auth, commonCtrl.saveMySettings)

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', ...auth, can('dashboard'), staffCtrl.getDashboard)

// ── Appointments + Walk-in Queue (one permission) ────────────────────────────
router.get('/appointments',                  ...auth, can('appointments'), staffCtrl.getAppointments)
router.post('/appointments',                 ...auth, can('appointments'), staffCtrl.createAppointment)
router.patch('/appointments/:id/confirm',    ...auth, can('appointments'), staffCtrl.confirmAppointment)
router.patch('/appointments/:id/cancel',     ...auth, can('appointments'), staffCtrl.cancelAppointment)
router.patch('/appointments/:id/no-show',    ...auth, can('appointments'), staffCtrl.markAppointmentNoShow)
router.patch('/appointments/:id/reschedule', ...auth, can('appointments'), staffCtrl.rescheduleAppointment)
router.get('/appointment-reasons',           ...auth, can('appointments'), staffCtrl.getAppointmentReasons)
router.get('/queue',                         ...auth, can('appointments'), staffCtrl.getQueue)
router.get('/queue/precheck/:patientId',     ...auth, can('appointments'), staffCtrl.getQueuePrecheck)
router.post('/queue',                        ...auth, can('appointments'), staffCtrl.addToQueue)
router.patch('/queue/:id/status',            ...auth, can('appointments'), staffCtrl.updateQueueStatus)

// Patient search is also needed by the Walk-in Queue, so either feature may use it.
router.get('/patients', ...auth, canAny('appointments', 'patient_records'), staffCtrl.getPatients)
router.post('/patients/walk-in', ...auth, can('appointments'), staffCtrl.createWalkInPatient)
router.get('/patients/:id', ...auth, can('patient_records'), staffCtrl.getPatientRecord)

// ── Checkout / Billing ───────────────────────────────────────────────────────
router.get('/billing', ...auth, canAny('checkout', 'billing'), staffCtrl.getBills)
router.get('/billing/catalog', ...auth, can('checkout'), staffCtrl.getBillingCatalogForStaff)
router.get('/billing/discount-presets', ...auth, can('checkout'), staffCtrl.getDiscountPresets)
router.get('/billing/:id/adjustment-requests', ...auth, canAny('checkout', 'billing'), staffCtrl.getBillingAdjustmentRequests)
router.post('/billing/:id/adjustment-requests', ...auth, can('checkout'), staffCtrl.requestBillingAdjustment)
router.patch('/billing/:id/adjustment-requests/:requestId/cancel', ...auth, can('checkout'), staffCtrl.cancelBillingAdjustmentRequest)
router.get('/billing/:id', ...auth, canAny('checkout', 'billing'), staffCtrl.getBillById)
router.put('/billing/:id', ...auth, can('checkout'), staffCtrl.updateBill)
router.get('/billing/:id/finalize-preview', ...auth, can('checkout'), staffCtrl.getFinalizePreview)
router.post('/billing/:id/finalize', ...auth, can('checkout'), staffCtrl.finalizeBill)
router.post('/billing/:id/pay', ...auth, can('checkout'), staffCtrl.payBill)
router.post('/billing/:id/confirm-payment', ...auth, can('checkout'), staffCtrl.confirmBillPayment)
router.get('/billing-payment-settings', ...auth, can('checkout'), staffCtrl.getPaymentSettingsForStaff)

// ── Inventory ────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, can('inventory'), staffCtrl.getInventory)
router.get('/inventory/master-data',  ...auth, can('inventory'), staffCtrl.getInventoryMasterData)
router.get('/inventory/locations',    ...auth, can('inventory'), staffCtrl.getInventoryLocations)
router.post('/inventory/locations',   ...auth, can('inventory'), staffCtrl.createInventoryLocation)
router.put('/inventory/locations/:id',...auth, can('inventory'), staffCtrl.updateInventoryLocation)
router.post('/inventory',             ...auth, can('inventory'), staffCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, can('inventory'), staffCtrl.updateStock)
router.put('/inventory/:id',          ...auth, can('inventory'), staffCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, can('inventory'), staffCtrl.deleteInventoryItem)

// Doctor availability is required by Appointments; the schedules page also uses it.
router.get('/doctors', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctors)
router.get('/walk-in/doctors', ...auth, can('appointments'), staffCtrl.getWalkInDoctors)
router.get('/doctors/:id/schedules', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctorSchedules)
router.get('/doctors/:id/availability', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctorAvailabilityForStaff)
router.get('/doctors/:id/unavailable-dates', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctorUnavailableDatesForStaff)

// ── Stock Transfers ──────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, can('stock_transfers'), staffCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, can('stock_transfers'), staffCtrl.resolveSupplyRequest)

// ── Accounts directory (Staff is read-only; permission changes stay Admin-only) ──
router.get('/admin-access/accounts', ...auth, can('accounts'), staffAccessCtrl.getAccountDirectory)

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/admin-access/reports', ...auth, can('reports'), adminCtrl.getReports)
router.post('/admin-access/reports/export-audit', ...auth, can('reports'), adminCtrl.recordReportExport)

// ── Audit Logs (read-only for Staff) ─────────────────────────────────────────
router.get('/admin-access/audit-logs', ...auth, can('audit_logs'), adminCtrl.getAuditLogs)
router.get('/admin-access/audit-logs/archive', ...auth, can('audit_logs'), adminCtrl.getAuditArchiveBatches)
router.get('/admin-access/audit-logs/archive/:archiveId', ...auth, can('audit_logs'), adminCtrl.getAuditArchiveDetail)

// ── Landing Page ─────────────────────────────────────────────────────────────
router.get('/admin-access/landing-page', ...auth, can('landing_page'), commonCtrl.getAdminLandingPage)
router.put('/admin-access/landing-page', ...auth, can('landing_page'), commonCtrl.saveAdminLandingPage)

// ── System Setup ─────────────────────────────────────────────────────────────
router.get('/admin-access/system-setup', ...auth, can('system_setup'), adminCtrl.getSystemSetup)
router.post('/admin-access/system-setup/service-categories', ...auth, can('system_setup'), adminCtrl.saveBillingServiceCategory)
router.put('/admin-access/system-setup/service-categories/:id', ...auth, can('system_setup'), adminCtrl.saveBillingServiceCategory)
router.delete('/admin-access/system-setup/service-categories/:id', ...auth, can('system_setup'), adminCtrl.deleteBillingServiceCategory)
router.post('/admin-access/system-setup/uoms', ...auth, can('system_setup'), adminCtrl.saveInventoryUom)
router.put('/admin-access/system-setup/uoms/:id', ...auth, can('system_setup'), adminCtrl.saveInventoryUom)
router.delete('/admin-access/system-setup/uoms/:id', ...auth, can('system_setup'), adminCtrl.deleteInventoryUom)
router.post('/admin-access/system-setup/suppliers', ...auth, can('system_setup'), adminCtrl.saveInventorySupplier)
router.put('/admin-access/system-setup/suppliers/:id', ...auth, can('system_setup'), adminCtrl.saveInventorySupplier)
router.post('/admin-access/system-setup/location-types', ...auth, can('system_setup'), adminCtrl.saveInventoryLocationType)
router.put('/admin-access/system-setup/location-types/:id', ...auth, can('system_setup'), adminCtrl.saveInventoryLocationType)
router.post('/admin-access/system-setup/movement-reasons', ...auth, can('system_setup'), adminCtrl.saveInventoryMovementReason)
router.put('/admin-access/system-setup/movement-reasons/:id', ...auth, can('system_setup'), adminCtrl.saveInventoryMovementReason)

router.get('/admin-access/appointment-reasons', ...auth, can('system_setup'), adminCtrl.getAppointmentReasonOptions)
router.post('/admin-access/appointment-reasons', ...auth, can('system_setup'), adminCtrl.createAppointmentReasonOption)
router.put('/admin-access/appointment-reasons/:reasonId', ...auth, can('system_setup'), adminCtrl.updateAppointmentReasonOption)
router.delete('/admin-access/appointment-reasons/:reasonId', ...auth, can('system_setup'), adminCtrl.deleteAppointmentReasonOption)

router.get('/admin-access/billing/catalog', ...auth, can('system_setup'), adminCtrl.getBillingCatalogAdmin)
router.post('/admin-access/billing/catalog', ...auth, can('system_setup'), adminCtrl.createBillingCatalogService)
router.put('/admin-access/billing/catalog/:serviceId', ...auth, can('system_setup'), adminCtrl.updateBillingCatalogService)
router.delete('/admin-access/billing/catalog/:serviceId', ...auth, can('system_setup'), adminCtrl.deleteBillingCatalogService)
router.get('/admin-access/billing/discount-presets', ...auth, can('system_setup'), adminCtrl.getDiscountPresetsAdmin)
router.post('/admin-access/billing/discount-presets', ...auth, can('system_setup'), adminCtrl.saveDiscountPresetAdmin)
router.put('/admin-access/billing/discount-presets/:id', ...auth, can('system_setup'), adminCtrl.saveDiscountPresetAdmin)
router.get('/admin-access/billing/payment-settings', ...auth, can('system_setup'), adminCtrl.getPaymentSettingsAdmin)
router.post('/admin-access/billing/payment-settings/upload', ...auth, can('system_setup'), express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }), adminCtrl.uploadPaymentQrImageAdmin)
router.post('/admin-access/billing/payment-settings/upload-status', ...auth, can('system_setup'), adminCtrl.getPaymentQrUploadScanStatusAdmin)
router.put('/admin-access/billing/payment-settings', ...auth, can('system_setup'), adminCtrl.updatePaymentSettingsAdmin)
router.get('/admin-access/clinic-settings', ...auth, can('system_setup'), adminCtrl.getClinicSettingsAdmin)
router.put('/admin-access/clinic-settings', ...auth, can('system_setup'), adminCtrl.updateClinicSettingsAdmin)
router.get('/admin-access/inventory', ...auth, can('system_setup'), adminCtrl.getInventory)

module.exports = router
