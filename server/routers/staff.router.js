// server/routers/staff.router.js
const express    = require('express')
const db = require('../db/connect')
const {listBillingCatalog} = require('../utils/billing')
const {validateBookingSettings}=require('../utils/bookingPolicy')
const router     = express.Router()
const staffCtrl  = require('../controllers/staff.controller')
const adminCtrl  = require('../controllers/admin.controller')
const staffAccessCtrl = require('../controllers/staffAccess.controller')
const {readBranchReport, recordBranchExport} = require('./branchReports')
const {readPage: readBranchAuditPage, archives: readBranchArchives, detail: readBranchArchiveDetail} = require('./branchAudit')
const {readSystemSetup} = require('./branchOperationalReads')
const {saveVisitReason,deactivateVisitReason,saveCancellation,deactivateCancellation,saveCategory,deactivateCategory} = require('./branchSystemWrites')
const commonCtrl = require('../controllers/common.controller')
const correctionsCtrl = require('../controllers/billingCorrections.controller')
const authenticate = require('../middlewares/auth.middleware')
const branchScope = require('../middlewares/branchScope.middleware')
const requireRole  = require('../middlewares/role.middleware')
const requirePasswordChangeCompleted = require('../middlewares/passwordChange.middleware')
const { requireStaffPermission, requireAnyStaffPermission } = require('../middlewares/staffPermission.middleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')

const baseAuth = [authenticate('staff_token'), requireRole('staff'), branchScope('staff')]
const auth = [...baseAuth, requirePasswordChangeCompleted]
const can = (key) => requireStaffPermission(key)
const canAny = (...keys) => requireAnyStaffPermission(...keys)

// These legacy handlers use an appointment or billing ID as their primary
// record. Verify ownership BEFORE any read/write handler can dereference it.
const mustOwn = (table,field = 'id',param = 'id') => async (req,res,next) => {
  const recordId=Number(req.params[param]);
  if (!Number.isSafeInteger(recordId) || recordId < 1) return res.status(400).json({message:'Invalid record.'})
  const [[owned]]=await db.query(`SELECT id FROM ${table} WHERE ${field}=? AND branch_id=? LIMIT 1`,[recordId,req.branchId])
  if (!owned) return res.status(404).json({message:'Record not found in your branch.'})
  next()
}
const ownAppointment=mustOwn('appointments')
const ownBill=mustOwn('billing_records')
const ownDoctor=mustOwn('doctors')
const readBranchServices=async(req,res)=>res.json(await listBillingCatalog({branchId:req.branchId,clinicType:String(req.query.clinic_type||'').trim()||undefined,includeInactive:String(req.query.include_inactive||'')==='1'}))
const readBranchDiscounts=async(req,res)=>{const [rows]=await db.query('SELECT * FROM discount_presets WHERE branch_id=? ORDER BY created_at,id',[req.branchId]);res.json(rows)}
const readBranchPaymentSettings=async(req,res)=>{const [[settings]]=await db.query('SELECT * FROM branch_payment_settings WHERE branch_id=?',[req.branchId]);res.json(settings||{})}
const readBranchBrand=async(req,res)=>{const [[settings]]=await db.query('SELECT * FROM clinic_settings WHERE id=1');res.json({...settings,clinic_name:req.branch.name,address:req.branch.address,phone:req.branch.phone,email:req.branch.email})}
const readBranchReasons=async(req,res)=>{const [rows]=await db.query('SELECT * FROM appointment_reason_options WHERE branch_id=? ORDER BY sort_order,label',[req.branchId]);res.json(rows)}
const readBranchPolicy=async(req,res)=>{const [[row]]=await db.query('SELECT * FROM branch_booking_settings WHERE branch_id=?',[req.branchId]);res.json(row||{})}
const writeBranchPolicy=async(req,res)=>{
  const settings=validateBookingSettings(req.body)
  const grace=Number(req.body?.no_show_grace_minutes??15)
  if(!Number.isInteger(grace)||grace<0||grace>240||grace%5!==0)return res.status(400).json({message:'No-show grace must be in five-minute increments, 0–240.'})
  await db.query(`INSERT INTO branch_booking_settings (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes,no_show_grace_minutes)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE online_min_lead_minutes=VALUES(online_min_lead_minutes),pending_confirmation_cutoff_minutes=VALUES(pending_confirmation_cutoff_minutes),booking_start_interval_minutes=VALUES(booking_start_interval_minutes),no_show_grace_minutes=VALUES(no_show_grace_minutes)`,
    [req.branchId,settings.online_min_lead_minutes,settings.pending_confirmation_cutoff_minutes,settings.booking_start_interval_minutes,grace])
  return readBranchPolicy(req,res)
}
const safeSettingsWriteUnavailable=(req,res)=>res.status(403).json({code:'BRANCH_SAFE_ACTION_REQUIRED',message:'This setup change is not yet supported safely from the Staff portal. Use an authorized Branch Administrator.'})



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
router.get('/appointments/booking-services', ...auth, can('appointments'), staffCtrl.getBillingCatalogForStaff)
router.get('/appointments/:id/inventory-readiness', ...auth, can('appointments'), staffCtrl.getAppointmentInventoryReadinessForPortal)
router.patch('/appointments/:id/confirm',    ...auth, can('appointments'), ownAppointment, staffCtrl.confirmAppointment)
router.patch('/appointments/:id/cancel',     ...auth, can('appointments'), ownAppointment, staffCtrl.cancelAppointment)
router.patch('/appointments/:id/no-show',    ...auth, can('appointments'), ownAppointment, staffCtrl.markAppointmentNoShow)
router.patch('/appointments/:id/reschedule', ...auth, can('appointments'), ownAppointment, staffCtrl.rescheduleAppointment)
router.get('/appointment-reasons',           ...auth, can('appointments'), staffCtrl.getAppointmentReasons)
router.get('/appointment-cancellation-reasons', ...auth, can('appointments'), staffCtrl.getAppointmentCancellationReasons)
router.get('/queue',                         ...auth, can('appointments'), staffCtrl.getQueue)
router.get('/queue/precheck/:patientId',     ...auth, can('appointments'), staffCtrl.getQueuePrecheck)
router.post('/queue',                        ...auth, can('appointments'), staffCtrl.addToQueue)
router.patch('/queue/:id/status',            ...auth, can('appointments'), staffCtrl.updateQueueStatus)

// Patient search is also needed by the Walk-in Queue, so either feature may use it.
router.get('/patients', ...auth, canAny('appointments', 'patient_records'), staffCtrl.getPatients)
router.get('/patients/walk-in-lookup', ...auth, can('appointments'), staffCtrl.lookupWalkInPatients)
router.post('/patients/walk-in', ...auth, can('appointments'), staffCtrl.createWalkInPatient)
router.get('/patients/:id', ...auth, can('patient_records'), staffCtrl.getPatientRecord)

// ── Checkout / Billing ───────────────────────────────────────────────────────
router.get('/billing', ...auth, canAny('checkout', 'billing'), staffCtrl.getBills)
router.get('/billing/catalog', ...auth, can('checkout'), staffCtrl.getBillingCatalogForStaff)
router.get('/billing/discount-presets', ...auth, can('checkout'), staffCtrl.getDiscountPresets)
router.get('/billing/cashier-closing', ...auth, can('checkout'), correctionsCtrl.getMyCashierClosing)
router.post('/billing/cashier-closing', ...auth, can('checkout'), correctionsCtrl.closeMyCashier)
router.get('/billing/:id/adjustment-requests', ...auth, canAny('checkout', 'billing'), ownBill, staffCtrl.getBillingAdjustmentRequests)
router.post('/billing/:id/adjustment-requests', ...auth, can('checkout'), ownBill, staffCtrl.requestBillingAdjustment)
router.patch('/billing/:id/adjustment-requests/:requestId/cancel', ...auth, can('checkout'), ownBill, staffCtrl.cancelBillingAdjustmentRequest)
router.get('/billing/:id', ...auth, canAny('checkout', 'billing'), ownBill, staffCtrl.getBillById)
router.put('/billing/:id', ...auth, can('checkout'), ownBill, staffCtrl.updateBill)
router.get('/billing/:id/finalize-preview', ...auth, can('checkout'), ownBill, staffCtrl.getFinalizePreview)
router.post('/billing/:id/finalize', ...auth, can('checkout'), ownBill, staffCtrl.finalizeBill)
router.post('/billing/:id/reopen', ...auth, can('checkout'), ownBill, staffCtrl.reopenBillForEditing)
router.post('/billing/:id/pay', ...auth, can('checkout'), ownBill, staffCtrl.payBill)
router.use('/billing', ...auth, can('checkout'), require('./paymongoGateway').apiRouter)
router.post('/billing/:id/confirm-payment', ...auth, can('checkout'), ownBill, staffCtrl.confirmBillPayment)
router.post('/billing/discount-proof/upload', ...auth, can('checkout'), express.raw({ type: ['image/png', 'image/jpeg'], limit: '5mb' }), adminCtrl.uploadDiscountProofImageAdmin)
router.post('/billing/discount-proof/upload-status', ...auth, can('checkout'), adminCtrl.getDiscountProofUploadScanStatusAdmin)
router.get('/billing-payment-settings', ...auth, can('checkout'), staffCtrl.getPaymentSettingsForStaff)

// ── Inventory ────────────────────────────────────────────────────────────────
router.get('/inventory',              ...auth, can('inventory'), staffCtrl.getInventory)
router.get('/inventory/master-data',  ...auth, can('inventory'), staffCtrl.getInventoryMasterData)
router.get('/inventory/locations',    ...auth, can('inventory'), staffCtrl.getInventoryLocations)
router.post('/inventory/locations',   ...auth, can('inventory'), staffCtrl.createInventoryLocation)
router.put('/inventory/locations/:id',...auth, can('inventory'), staffCtrl.updateInventoryLocation)
router.post('/inventory',             ...auth, can('inventory'), staffCtrl.addInventoryItem)
router.patch('/inventory/:id/stock',  ...auth, can('inventory'), staffCtrl.updateStock)
router.post('/inventory/:id/move-location', ...auth, can('inventory'), correctionsCtrl.moveStockBetweenLocations)
router.put('/inventory/:id',          ...auth, can('inventory'), staffCtrl.updateInventoryItem)
router.delete('/inventory/:id',       ...auth, can('inventory'), staffCtrl.deleteInventoryItem)

// Doctor availability is required by Appointments; the schedules page also uses it.
router.get('/doctors', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctors)
router.get('/walk-in/doctors', ...auth, can('appointments'), staffCtrl.getWalkInDoctors)
router.get('/doctors/:id/schedules', ...auth, canAny('appointments', 'doctor_schedules'), staffCtrl.getDoctorSchedules)
router.get('/doctors/:id/availability', ...auth, canAny('appointments', 'doctor_schedules'), ownDoctor, staffCtrl.getDoctorAvailabilityForStaff)
router.get('/doctors/:id/unavailable-dates', ...auth, canAny('appointments', 'doctor_schedules'), ownDoctor, staffCtrl.getDoctorUnavailableDatesForStaff)
router.get('/doctors/:id/available-slots', ...auth, canAny('appointments', 'doctor_schedules'), ownDoctor, staffCtrl.getAppointmentAvailableSlotsForStaff)

// ── Stock Transfers ──────────────────────────────────────────────────────────
router.get('/supply-requests',       ...auth, can('stock_transfers'), staffCtrl.getSupplyRequests)
router.patch('/supply-requests/:id', ...auth, can('stock_transfers'), staffCtrl.resolveSupplyRequest)

// ── Accounts directory (Staff is read-only; permission changes stay Admin-only) ──
router.get('/admin-access/accounts', ...auth, can('accounts'), staffAccessCtrl.getAccountDirectory)

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/admin-access/reports', ...auth, can('reports'), readBranchReport)
router.post('/admin-access/reports/export-audit', ...auth, can('reports'), recordBranchExport)

// ── Audit Logs (read-only for Staff) ─────────────────────────────────────────
router.get('/admin-access/audit-logs', ...auth, can('audit_logs'), (req,res)=>readBranchAuditPage(req,res))
router.get('/admin-access/audit-logs/archive', ...auth, can('audit_logs'), readBranchArchives)
router.get('/admin-access/audit-logs/archive/:archiveId', ...auth, can('audit_logs'), (req,res)=>{req.params.id=req.params.archiveId;return readBranchArchiveDetail(req,res)})

// ── System Setup ─────────────────────────────────────────────────────────────
router.get('/admin-access/system-setup', ...auth, can('system_setup'), readSystemSetup)
router.get('/admin-access/system-setup/booking-policy', ...auth, can('system_setup'), readBranchPolicy)
router.put('/admin-access/system-setup/booking-policy', ...auth, can('system_setup'), writeBranchPolicy)
router.post('/admin-access/system-setup/cancellation-reasons', ...auth, can('system_setup'), saveCancellation)
router.put('/admin-access/system-setup/cancellation-reasons/:id', ...auth, can('system_setup'), saveCancellation)
router.delete('/admin-access/system-setup/cancellation-reasons/:id', ...auth, can('system_setup'), deactivateCancellation)
router.post('/admin-access/system-setup/service-categories', ...auth, can('system_setup'), saveCategory)
router.put('/admin-access/system-setup/service-categories/:id', ...auth, can('system_setup'), saveCategory)
router.delete('/admin-access/system-setup/service-categories/:id', ...auth, can('system_setup'), deactivateCategory)
router.post('/admin-access/system-setup/uoms', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/system-setup/uoms/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.delete('/admin-access/system-setup/uoms/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.post('/admin-access/system-setup/suppliers', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/system-setup/suppliers/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.post('/admin-access/system-setup/location-types', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/system-setup/location-types/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.post('/admin-access/system-setup/movement-reasons', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/system-setup/movement-reasons/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)

router.get('/admin-access/appointment-reasons', ...auth, can('system_setup'), readBranchReasons)
router.post('/admin-access/appointment-reasons', ...auth, can('system_setup'), saveVisitReason)
router.put('/admin-access/appointment-reasons/:reasonId', ...auth, can('system_setup'), saveVisitReason)
router.delete('/admin-access/appointment-reasons/:reasonId', ...auth, can('system_setup'), deactivateVisitReason)

router.get('/admin-access/billing/catalog', ...auth, can('system_setup'), readBranchServices)
router.post('/admin-access/billing/catalog', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/billing/catalog/:serviceId', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.delete('/admin-access/billing/catalog/:serviceId', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.get('/admin-access/billing/discount-presets', ...auth, can('system_setup'), readBranchDiscounts)
router.post('/admin-access/billing/discount-presets', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/billing/discount-presets/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.get('/admin-access/billing/payment-settings', ...auth, can('system_setup'), readBranchPaymentSettings)
router.post('/admin-access/billing/payment-settings/upload', ...auth, can('system_setup'), express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }), safeSettingsWriteUnavailable)
router.post('/admin-access/billing/payment-settings/upload-status', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/billing/payment-settings', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.get('/admin-access/clinic-settings', ...auth, can('system_setup'), readBranchBrand)
router.put('/admin-access/clinic-settings', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.get('/admin-access/inventory', ...auth, can('system_setup'), staffCtrl.getInventory)
router.get('/admin-access/inventory/locations', ...auth, can('system_setup'), staffCtrl.getInventoryLocations)
router.post('/admin-access/inventory/locations', ...auth, can('system_setup'), safeSettingsWriteUnavailable)
router.put('/admin-access/inventory/locations/:id', ...auth, can('system_setup'), safeSettingsWriteUnavailable)

module.exports = router

