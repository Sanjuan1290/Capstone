// server/routers/auth.router.js
// Mounted at /api/v1/auth in server.js
// (Vite proxy rewrites /api → /api/v1, so frontend calls /api/auth/... → hits /api/v1/auth/...)

const express = require('express')
const router  = express.Router()
const { forgotPassword, verifyOtp, resetPassword } = require('../controllers/auth.controller')
const commonCtrl = require('../controllers/common.controller')
const { otpRequestLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware')

// All public — no auth middleware needed
router.post('/forgot-password', otpRequestLimiter, forgotPassword)  // Step 1: validates account and sends OTP by email/SMS
router.post('/verify-otp',      otpVerifyLimiter, verifyOtp)        // Step 2: verifies OTP, returns resetToken
router.post('/reset-password',  otpVerifyLimiter, resetPassword)    // Step 3: sets new password
router.get('/promotions', require('../controllers/promotions.controller').getPublicPromotions)
router.get('/landing-page',     commonCtrl.getPublicLandingPage)
router.get('/public-directory', async (req,res) => {
  try { res.json(await require('../utils/publicLandingDirectory').getPublicLandingDirectory()) }
  catch { res.status(503).json({message:'Clinic directory is temporarily unavailable.'}) }
})
router.get('/clinic-settings',   commonCtrl.getPublicClinicSettings)

module.exports = router

