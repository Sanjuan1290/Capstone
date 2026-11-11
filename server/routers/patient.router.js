// server/routers/patient.router.js
// FIX #3 — Added POST /register/verify route

const express     = require('express')
const router      = express.Router()
const verifyToken = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')
const {
  register, verifyRegistration, resendRegistrationVerification, login, checkAuth, logout,
  getProfileStatus, updateProfile,
  getAppointments, getHistory, getMyBillingHistory, getMyBillingDetails,
  createAppointment, cancelAppointment, rescheduleAppointment, getAppointmentCancellationReasons,
  getAppointmentReasons, getBookingReadiness, getBookingServices, getDoctors, getDoctorsAvailability, getDoctorSchedule, getDoctorUnavailableDatesController, getDoctorAvailableSlots, getDoctorTakenSlots,
} = require('../controllers/patient.controller')
const commonCtrl = require('../controllers/common.controller')
const promotionsCtrl = require('../controllers/promotions.controller')
const db = require('../db/connect')
const { cloneDefaultBookingPolicyDocument, parseStoredBookingPolicyDocument } = require('../utils/bookingPolicyDocument')

// Physical clinic locations available for online patient booking.
router.get('/branches', async(req,res)=>{
 const [rows]=await db.query('SELECT id,name,address,phone,google_maps_url,offers_medical,offers_derma FROM clinic_branches WHERE is_active=1 ORDER BY created_at,id')
 res.json(rows)
})
// Public policy page. A branch is optional; without one, patients see the clinic-wide default policy.
router.get('/booking-policy', async(req,res)=>{
 const rawBranchId=String(req.query.branch_id||'').trim()
 if(!rawBranchId){
  return res.json({...cloneDefaultBookingPolicyDocument(),branch_id:null,branch_name:null,uses_default:true,is_branch_specific:false,published_at:null})
 }
 const branchId=Number(rawBranchId)
 if(!/^\d+$/.test(rawBranchId)||!Number.isSafeInteger(branchId)||branchId<1)return res.status(400).json({message:'Select a valid clinic branch.'})
 const [[row]]=await db.query(`SELECT cb.id,cb.name,d.published_document,d.is_published,d.published_at
  FROM clinic_branches cb LEFT JOIN branch_booking_policy_documents d ON d.branch_id=cb.id
  WHERE cb.id=? AND cb.is_active=1 LIMIT 1`,[branchId])
 if(!row)return res.status(404).json({message:'This clinic branch is not available.'})
 const published=Number(row.is_published)===1?parseStoredBookingPolicyDocument(row.published_document):null
 const document=published||cloneDefaultBookingPolicyDocument()
 res.json({...document,branch_id:Number(row.id),branch_name:row.name,uses_default:!published,is_branch_specific:Boolean(published),published_at:published?row.published_at:null})
})
// Public
router.post('/register',        otpRequestLimiter, register)
router.post('/register/verify', otpVerifyLimiter, verifyRegistration)
router.post('/register/resend', otpRequestLimiter, resendRegistrationVerification)  // FIX #3 — new verification step
router.post('/login',           loginLimiter, login)
router.get('/check-auth',       checkAuth)           // FIXED ROUTE
router.post('/logout',          logout)

// Protected
router.use(verifyToken('patient_token'), requireRole('patient')) // FIXED MIDDLEWARE
router.post('/security/password/request-code', otpRequestLimiter, commonCtrl.requestMyPasswordCode)
router.post('/security/password/change', otpVerifyLimiter, commonCtrl.changeMyPassword)
router.post('/security/phone/request-code', otpRequestLimiter, commonCtrl.requestMyPhoneChange)
router.post('/security/phone/change', otpVerifyLimiter, commonCtrl.confirmMyPhoneChange)
router.post('/security/email/request-code', otpRequestLimiter, commonCtrl.requestMyEmailVerification)
router.post('/security/email/verify', otpVerifyLimiter, commonCtrl.confirmMyEmailVerification)
router.patch('/onboarding/complete', commonCtrl.completePatientOnboarding)
router.get('/notifications',                        commonCtrl.listNotifications)
router.get('/notifications/:id/destination', commonCtrl.getNotificationDestination)
router.patch('/notifications/read-all',             commonCtrl.readAllNotifications)
router.patch('/notifications/:id/read',             commonCtrl.readNotification)
router.get('/settings',                             commonCtrl.getMySettings)
router.put('/settings',                             commonCtrl.saveMySettings)
router.put('/settings/profile-photo', commonCtrl.saveMyProfilePhoto)
router.delete('/settings/profile-photo', commonCtrl.removeMyProfilePhoto)
router.get('/profile-status',                       getProfileStatus)
router.put('/profile-status',                       updateProfile)
router.get('/appointments',                        getAppointments)
router.post('/appointments',                       createAppointment)
router.get('/appointments/history',                getHistory)
router.get('/billing/history',                      getMyBillingHistory)
router.get('/billing/history/:id',                  getMyBillingDetails)
router.get('/appointment-reasons',                 getAppointmentReasons)
router.get('/appointment-cancellation-reasons',    getAppointmentCancellationReasons)
router.get('/booking-readiness',                    getBookingReadiness)
router.get('/booking-services',                     getBookingServices)
router.get('/promotions',                          promotionsCtrl.getActivePromotions)
router.patch('/appointments/:id/cancel',           cancelAppointment)
router.patch('/appointments/:id/reschedule',       rescheduleAppointment)
router.get('/doctors',                             getDoctors)
router.get('/doctors/availability',                getDoctorsAvailability)
router.get('/doctors/:id/schedule',                getDoctorSchedule)
router.get('/doctors/:id/unavailable-dates',       getDoctorUnavailableDatesController)
router.get('/doctors/:id/available-slots',          getDoctorAvailableSlots)
router.get('/doctors/:id/taken-slots',             getDoctorTakenSlots)

module.exports = router


