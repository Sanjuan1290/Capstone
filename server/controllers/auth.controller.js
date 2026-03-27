// server/controllers/auth.controller.js
// Forgot/reset password flow using a 6-digit OTP email code.
// Flow: forgotPassword → send OTP email → verifyOtp → get reset token → resetPassword

const db     = require('../db/connect')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { sendPasswordResetOtp } = require('../utils/emailService')

const TABLE_MAP = { patient: 'patients', doctor: 'doctors', staff: 'staff' }

// ── Step 1: Request OTP ───────────────────────────────────────────────────────
// POST /api/auth/forgot-password   Body: { email, role }
const forgotPassword = async (req, res) => {
  const { email, role } = req.body
  if (!email || !TABLE_MAP[role])
    return res.status(400).json({ message: 'Email and valid role are required.' })

  // Always return generic message to prevent email enumeration
  const generic = { message: 'If that email is registered, a verification code has been sent.' }

  const [rows] = await db.query(
    `SELECT id, full_name FROM ${TABLE_MAP[role]} WHERE email = ?`, [email]
  )
  if (rows.length === 0) return res.json(generic)

  // Generate 6-digit OTP
  const otp     = String(Math.floor(100000 + Math.random() * 900000))
  const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  // Delete any existing reset entries for this email+role
  await db.query('DELETE FROM password_resets WHERE email = ? AND role = ?', [email, role])

  // Store OTP (in the token column) — reset_token column stores the OTP
  await db.query(
    'INSERT INTO password_resets (email, token, role, expires_at) VALUES (?, ?, ?, ?)',
    [email, otp, role, expires]
  )

  try {
    await sendPasswordResetOtp(email, rows[0].full_name, role, otp)
  } catch (err) {
    console.error('⚠️  OTP email failed:', err.message)
    // Still return generic message — don't leak whether email exists
  }

  res.json(generic)
}

// ── Step 2: Verify OTP ────────────────────────────────────────────────────────
// POST /api/auth/verify-otp   Body: { email, role, otp }
const verifyOtp = async (req, res) => {
  const { email, role, otp } = req.body
  if (!email || !role || !otp)
    return res.status(400).json({ message: 'Email, role, and OTP are required.' })

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE email = ? AND role = ? AND token = ? AND expires_at > NOW()',
    [email, role, String(otp)]
  )
  if (rows.length === 0)
    return res.status(400).json({ message: 'Invalid or expired verification code.' })

  // OTP is valid — issue a short-lived reset token (60 min) and mark OTP as used
  const resetToken = crypto.randomBytes(32).toString('hex')
  const newExpiry  = new Date(Date.now() + 60 * 60 * 1000) // 60 minutes

  // Replace OTP with the actual reset token so it can only be used once
  await db.query(
    'UPDATE password_resets SET token = ?, expires_at = ? WHERE id = ?',
    [resetToken, newExpiry, rows[0].id]
  )

  res.json({ message: 'Code verified.', resetToken })
}

// ── Step 3: Set new password ──────────────────────────────────────────────────
// POST /api/auth/reset-password   Body: { resetToken, password }
const resetPassword = async (req, res) => {
  const { resetToken, password } = req.body
  if (!resetToken || !password)
    return res.status(400).json({ message: 'Reset token and new password are required.' })
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
    [resetToken]
  )
  if (rows.length === 0)
    return res.status(400).json({ message: 'Reset session expired. Please start over.' })

  const { email, role } = rows[0]
  const table = TABLE_MAP[role]
  if (!table)
    return res.status(400).json({ message: 'Invalid role in reset token.' })

  const hashed = await bcrypt.hash(password, 10)
  await db.query(`UPDATE ${table} SET password = ? WHERE email = ?`, [hashed, email])
  await db.query('DELETE FROM password_resets WHERE token = ?', [resetToken])

  res.json({ message: 'Password reset successfully. You can now log in.' })
}

module.exports = { forgotPassword, verifyOtp, resetPassword }