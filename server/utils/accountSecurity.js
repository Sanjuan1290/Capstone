const db = require('../db/connect')
const bcrypt = require('bcrypt')
const { sendPasswordResetOtp, sendAdminMfaOtp, sendAccountSecurityOtp } = require('./emailService')
const { sendPatientPasswordResetOtp, sendPatientPhoneChangeOtp } = require('./smsService')
const { normalizePhilippinePhone } = require('./phone')
const { makeNumericCode, hashSecret, timingSafeEqualHash } = require('./securityCrypto')
const { revokeSessions, issueSession } = require('./sessionSecurity')

const ROLE_TABLE = { admin: 'admins', staff: 'staff', doctor: 'doctors', patient: 'patients' }
const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

const getAccount = async (role, id, executor = db) => {
  const table = ROLE_TABLE[role]
  if (!table) return null
  const fields = role === 'patient' ? 'id, full_name, email, phone' : 'id, full_name, email'
  const [rows] = await executor.query(`SELECT ${fields} FROM ${table} WHERE id = ? LIMIT 1`, [id])
  return rows[0] || null
}

const validatePassword = (password) => {
  const value = String(password || '')
  if (value.length < 8) return 'Password must be at least 8 characters.'
  if (value.length > 128) return 'Password is too long.'
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return 'Password must contain uppercase, lowercase, and a number.'
  }
  return null
}

const createSecurityCode = async ({ role, accountId, purpose, payload = null, executor = db }) => {
  const [existing] = await executor.query(
    'SELECT id, last_sent_at, created_at FROM account_security_codes WHERE role = ? AND account_id = ? LIMIT 1',
    [role, accountId]
  )
  const lastSent = existing[0]?.last_sent_at || existing[0]?.created_at
  if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_COOLDOWN_MS) {
    const err = new Error('Please wait 60 seconds before requesting another code.')
    err.statusCode = 429
    throw err
  }

  const code = makeNumericCode()
  const hash = hashSecret(code)
  const expires = new Date(Date.now() + CODE_TTL_MS)
  await executor.query('DELETE FROM account_security_codes WHERE role = ? AND account_id = ?', [role, accountId])
  await executor.query(
    `INSERT INTO account_security_codes
     (role, account_id, purpose, code, payload, expires_at, attempt_count, last_sent_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
    [role, accountId, purpose, hash, payload ? JSON.stringify(payload) : null, expires]
  )
  return code
}

const verifySecurityCode = async ({ role, accountId, purpose, code, consume = true, executor = db }) => {
  const [rows] = await executor.query(
    `SELECT * FROM account_security_codes
     WHERE role = ? AND account_id = ? AND purpose = ? AND expires_at > NOW()
     LIMIT 1`,
    [role, accountId, purpose]
  )
  const row = rows[0]
  if (!row || Number(row.attempt_count || 0) >= MAX_ATTEMPTS) {
    throw new Error('Invalid or expired verification code.')
  }
  if (!timingSafeEqualHash(code, row.code)) {
    await executor.query('UPDATE account_security_codes SET attempt_count = attempt_count + 1 WHERE id = ?', [row.id])
    if (Number(row.attempt_count || 0) + 1 >= MAX_ATTEMPTS) {
      await executor.query('DELETE FROM account_security_codes WHERE id = ?', [row.id])
    }
    throw new Error('Invalid or expired verification code.')
  }
  if (consume) await executor.query('DELETE FROM account_security_codes WHERE id = ?', [row.id])
  let payload = null
  try { payload = row.payload ? JSON.parse(row.payload) : null } catch { payload = null }
  return { ...row, payload }
}

const requestCode = async (role, id) => {
  const account = await getAccount(role, id)
  if (!account) throw new Error('Account not found.')
  const code = await createSecurityCode({ role, accountId: id, purpose: 'password_change' })
  if (role === 'patient') {
    await sendPatientPasswordResetOtp({ phone: account.phone, code, fullName: account.full_name })
    return { channel: 'sms', destination: account.phone }
  }
  await sendAccountSecurityOtp(account.email, account.full_name, code)
  return { channel: 'email', destination: account.email }
}

const changeWithCode = async (role, id, code, newPassword, res = null) => {
  const error = validatePassword(newPassword)
  if (error) throw new Error(error)
  await verifySecurityCode({ role, accountId: id, purpose: 'password_change', code })
  const table = ROLE_TABLE[role]
  const hashed = await bcrypt.hash(newPassword, 10)
  const extra = ['staff', 'doctor'].includes(role) ? ', must_change_password = 0, password_changed_at = NOW()' : ''
  await db.query(`UPDATE ${table} SET password = ?${extra} WHERE id = ?`, [hashed, id])
  await revokeSessions(role, id)
  if (res) await issueSession(res, role, id)
}

const completeRequiredChange = async (role, id, newPassword, res = null) => {
  if (!['staff', 'doctor'].includes(role)) throw new Error('This account does not require first-login password setup.')
  const error = validatePassword(newPassword)
  if (error) throw new Error(error)
  const table = ROLE_TABLE[role]
  const [rows] = await db.query(`SELECT must_change_password FROM ${table} WHERE id = ? LIMIT 1`, [id])
  if (!rows.length) throw new Error('Account not found.')
  if (!Number(rows[0].must_change_password)) return
  const hashed = await bcrypt.hash(newPassword, 10)
  await db.query(`UPDATE ${table} SET password = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?`, [hashed, id])
  await revokeSessions(role, id)
  if (res) await issueSession(res, role, id)
}

const requestPatientPhoneChange = async (patientId, rawPhone) => {
  const account = await getAccount('patient', patientId)
  if (!account) throw new Error('Patient account not found.')
  const newPhone = normalizePhilippinePhone(rawPhone)
  if (!newPhone) throw new Error('Enter a valid Philippine mobile number.')
  if (newPhone === normalizePhilippinePhone(account.phone)) throw new Error('Enter a different mobile number.')

  const variants = [newPhone, `0${newPhone.slice(2)}`, newPhone.slice(2)]
  const normalizedSql = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"
  const [existing] = await db.query(
    `SELECT id FROM patients WHERE ${normalizedSql} IN (?, ?, ?) AND id <> ? LIMIT 1`,
    [...variants, patientId]
  )
  if (existing.length) throw new Error('That mobile number is already used by another patient account.')

  const code = await createSecurityCode({
    role: 'patient', accountId: patientId, purpose: 'phone_change', payload: { new_phone: newPhone },
  })
  await sendPatientPhoneChangeOtp({ phone: newPhone, code, fullName: account.full_name })
  return { channel: 'sms' }
}

const confirmPatientPhoneChange = async (patientId, code, res = null) => {
  const verified = await verifySecurityCode({ role: 'patient', accountId: patientId, purpose: 'phone_change', code })
  const newPhone = normalizePhilippinePhone(verified.payload?.new_phone)
  if (!newPhone) throw new Error('The requested mobile number is no longer valid. Please start again.')
  await db.query('UPDATE patients SET phone = ? WHERE id = ?', [newPhone, patientId])
  await revokeSessions('patient', patientId)
  if (res) await issueSession(res, 'patient', patientId)
  return newPhone
}

const requestAdminMfa = async (admin) => {
  const code = await createSecurityCode({ role: 'admin', accountId: admin.id, purpose: 'admin_mfa' })
  await sendAdminMfaOtp(admin.email, admin.full_name, code)
}

const verifyAdminMfa = async (adminId, code) => verifySecurityCode({ role: 'admin', accountId: adminId, purpose: 'admin_mfa', code })

module.exports = {
  requestCode,
  changeWithCode,
  completeRequiredChange,
  validatePassword,
  createSecurityCode,
  verifySecurityCode,
  requestPatientPhoneChange,
  confirmPatientPhoneChange,
  requestAdminMfa,
  verifyAdminMfa,
}



