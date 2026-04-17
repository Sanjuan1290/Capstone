// server/routers/auth.router.js
// Mounted at /api/v1/auth in server.js
// (Vite proxy rewrites /api → /api/v1, so frontend calls /api/auth/... → hits /api/v1/auth/...)

const express = require('express')
const router  = express.Router()
const { forgotPassword, verifyOtp, resetPassword } = require('../controllers/auth.controller')
const commonCtrl = require('../controllers/common.controller')

// All public — no auth middleware needed
router.post('/forgot-password', forgotPassword)  // Step 1: sends OTP email
router.post('/verify-otp',      verifyOtp)        // Step 2: verifies OTP, returns resetToken
router.post('/reset-password',  resetPassword)    // Step 3: sets new password
router.get('/landing-page',     commonCtrl.getPublicLandingPage)

module.exports = router
