const crypto = require('node:crypto')
const db = require('../db/connect')
const { normalizePhilippinePhone } = require('../utils/phone')
const { createSecurityCode, verifySecurityCode } = require('../utils/accountSecurity')
const { hashSecret } = require('../utils/securityCrypto')
const { claimRegistrationSms } = require('../utils/registrationSmsLimits')
const { sendGuestBookingOtp, isSmsConfigured } = require('../utils/smsService')
const { verificationProof, issuePhoneProof, verificationState, VERIFICATION_SECONDS, fail } = require('../utils/guestBookingPolicy')

// account_id=0 is a non-account challenge namespace. The purpose includes the
// normalized phone; (role,account_id,purpose) isolates it from portal OTPs.
const purposeFor = phone => 'guest_booking:' + phone
const withPhoneLock = async (phone, work) => {
  const conn = await db.getConnection()
  const name = 'carait:guest-otp:' + crypto.createHash('sha256').update(phone).digest('hex').slice(0, 32)
  let acquired = false
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?,5) AS acquired', [name])
    if (Number(row?.acquired) !== 1) throw fail(409, 'VERIFICATION_BUSY', 'Verification is being processed. Try again.')
    acquired = true
    // Autocommit preserves failed-attempt increments from verifySecurityCode.
    return await work(conn)
  } finally {
    if (acquired) await conn.query('SELECT RELEASE_LOCK(?)', [name]).catch(() => {})
    conn.release()
  }
}
const requestCode = async (req, res) => {
  const phone = normalizePhilippinePhone(req.body?.phone)
  if (!phone) throw fail(400, 'INVALID_PHONE', 'Enter a valid Philippine mobile number.')
  if (!isSmsConfigured()) throw fail(503, 'SMS_UNAVAILABLE', 'SMS verification is temporarily unavailable. Please try again later.')
  await withPhoneLock(phone, async conn => {
    // Reuse the lock connection so parallel requests cannot exhaust the pool
    // while each waits for a second connection to reserve its SMS quota.
    await conn.beginTransaction()
    try {
      await claimRegistrationSms(phone, { connection: conn })
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error }
    const purpose = purposeFor(phone)
    const code = await createSecurityCode({ role: 'patient', accountId: 0, purpose, payload: { phone }, executor: conn })
    try { await sendGuestBookingOtp({ phone, code }) }
    catch {
      await conn.query('DELETE FROM account_security_codes WHERE role=? AND account_id=0 AND purpose=? AND code=?', ['patient', purpose, hashSecret(code)])
      throw fail(502, 'SMS_DELIVERY_FAILED', 'The verification code could not be sent. Please try again later.')
    }
  })
  res.setHeader('Cache-Control', 'no-store')
  res.json({ phone, message: 'SMS verification code sent.', expires_in_seconds: 600, resend_after_seconds: 60 })
}
const verifyCode = async (req, res) => {
  const phone = normalizePhilippinePhone(req.body?.phone), code = String(req.body?.code || '').trim()
  if (!phone || !/^\d{6}$/.test(code)) throw fail(400, 'INVALID_CODE', 'Enter your mobile number and the complete 6-digit code.')
  await withPhoneLock(phone, async conn => {
    try { await verifySecurityCode({ role: 'patient', accountId: 0, purpose: purposeFor(phone), code, executor: conn }) }
    catch (error) { if (error.code) throw error; throw fail(400, 'INVALID_CODE', 'Invalid or expired verification code.') }
  })
  issuePhoneProof(res, phone)
  res.setHeader('Cache-Control', 'no-store')
  res.json({ ...await verificationState(db, phone, new Date(Date.now() + VERIFICATION_SECONDS * 1000).toISOString()), message: 'Mobile number verified.' })
}
const status = async (req, res) => {
  const proof = verificationProof(req)
  res.setHeader('Cache-Control', 'private, no-store')
  res.json(proof ? await verificationState(db, proof.phone, new Date(proof.exp * 1000).toISOString()) : { verified: false })
}
module.exports = { requestCode, verifyCode, status }
