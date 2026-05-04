const db = require('../db/connect')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { sendPasswordResetOtp } = require('../utils/emailService')

const ROLE_CONFIG = {
  patient: {
    table: 'patients',
    where: 'email = ?',
    missingMessage: 'No patient account is registered with that email.',
  },
  doctor: {
    table: 'doctors',
    where: 'email = ? AND is_active = 1',
    missingMessage: 'No active doctor account is registered with that email.',
  },
  staff: {
    table: 'staff',
    where: "email = ? AND status = 'active'",
    missingMessage: 'No active staff account is registered with that email.',
  },
}

const forgotPassword = async (req, res) => {
  const { email, role } = req.body
  const config = ROLE_CONFIG[role]

  if (!email || !config) {
    return res.status(400).json({ message: 'Email and valid role are required.' })
  }

  const [rows] = await db.query(
    `SELECT id, full_name FROM ${config.table} WHERE ${config.where}`,
    [email]
  )

  if (rows.length === 0) {
    return res.status(404).json({ message: config.missingMessage })
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const expires = new Date(Date.now() + 10 * 60 * 1000)

  await db.query('DELETE FROM password_resets WHERE email = ? AND role = ?', [email, role])
  await db.query(
    'INSERT INTO password_resets (email, token, role, expires_at) VALUES (?, ?, ?, ?)',
    [email, otp, role, expires]
  )

  try {
    await sendPasswordResetOtp(email, rows[0].full_name, role, otp)
  } catch (err) {
    console.error('Password reset OTP email failed:', err.message)
    await db.query('DELETE FROM password_resets WHERE email = ? AND role = ?', [email, role])
    return res.status(500).json({ message: 'Failed to send verification code. Please try again.' })
  }

  return res.json({ message: 'Verification code sent.' })
}

const verifyOtp = async (req, res) => {
  const { email, role, otp } = req.body

  if (!email || !role || !otp) {
    return res.status(400).json({ message: 'Email, role, and OTP are required.' })
  }

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE email = ? AND role = ? AND token = ? AND expires_at > NOW()',
    [email, role, String(otp)]
  )

  if (rows.length === 0) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' })
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  const newExpiry = new Date(Date.now() + 60 * 60 * 1000)

  await db.query(
    'UPDATE password_resets SET token = ?, expires_at = ? WHERE id = ?',
    [resetToken, newExpiry, rows[0].id]
  )

  return res.json({ message: 'Code verified.', resetToken })
}

const resetPassword = async (req, res) => {
  const { resetToken, password } = req.body

  if (!resetToken || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })
  }

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
    [resetToken]
  )

  if (rows.length === 0) {
    return res.status(400).json({ message: 'Reset session expired. Please start over.' })
  }

  const { email, role } = rows[0]
  const config = ROLE_CONFIG[role]

  if (!config) {
    return res.status(400).json({ message: 'Invalid role in reset token.' })
  }

  const hashed = await bcrypt.hash(password, 10)
  await db.query(`UPDATE ${config.table} SET password = ? WHERE email = ?`, [hashed, email])
  await db.query('DELETE FROM password_resets WHERE token = ?', [resetToken])

  return res.json({ message: 'Password reset successfully. You can now log in.' })
}

module.exports = { forgotPassword, verifyOtp, resetPassword }
