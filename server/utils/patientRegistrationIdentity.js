const { normalizePhilippinePhone } = require('./phone')
const { toDateOnly } = require('./patientProfile')
const phoneSql = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'+',''),'-',''),' ',''),'(',''),')','')"
const fail = (code, message, statusCode = 409) => Object.assign(new Error(message), { statusCode, code })
const nameKey = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

// A walk-in has a patient record, but no portal credentials. Only a verified
// matching mobile may upgrade it; an email match alone cannot claim history.
const resolveRegistrationPatient = async (executor, phone, profile, options = {}) => {
  const variants = [phone, '0' + phone.slice(2), phone.slice(2)]
  const email = String(profile.email || '').trim().toLowerCase()
  const [rows] = await executor.query(`SELECT id,full_name,email,phone,birthdate,COALESCE(gender,sex) AS gender,
    is_walk_in,password,COALESCE(is_banned,0) AS is_banned FROM patients
    WHERE ${phoneSql} IN (?,?,?) OR LOWER(TRIM(email))=? ORDER BY id${options.lock ? ' FOR UPDATE' : ''}`, [...variants, email])
  const byPhone = rows.filter(row => normalizePhilippinePhone(row.phone) === phone)
  const byEmail = rows.filter(row => String(row.email || '').trim().toLowerCase() === email)
  if (byPhone.length > 1 || byEmail.length > 1) throw fail('PATIENT_CONTACT_AMBIGUOUS', 'Multiple patient records use these contact details. Please contact the clinic to link your account.')
  const target = byPhone[0] || null
  const hasAccount = row => Number(row.is_walk_in) !== 1 || Boolean(String(row.password || '').trim())
  if (target && hasAccount(target)) throw fail('PATIENT_ACCOUNT_EXISTS', 'An account with that phone number already exists. Please sign in or reset your password.')
  if (byEmail[0] && Number(byEmail[0].id) !== Number(target?.id)) {
    if (hasAccount(byEmail[0])) throw fail('PATIENT_EMAIL_IN_USE', 'That email address is already linked to another patient account.')
    throw fail('WALK_IN_CONTACT_MISMATCH', 'This email is saved on a walk-in record with a different mobile number. Use the mobile recorded with the clinic, or contact the clinic to update it before registering.')
  }
  if (target) {
    if (Number(target.is_banned)) throw fail('PATIENT_ACCOUNT_BANNED', 'Please contact the clinic before registering this patient account.', 403)
    const mismatched = (target.full_name && nameKey(target.full_name) !== nameKey(profile.full_name)) ||
      (target.birthdate && toDateOnly(target.birthdate) !== profile.birthdate) ||
      (target.gender && String(target.gender).toLowerCase() !== String(profile.gender).toLowerCase())
    if (mismatched) throw fail('WALK_IN_IDENTITY_MISMATCH', 'Your details differ from the clinic’s walk-in record. Please contact the clinic to link your account without changing another patient’s history.')
  }
  if (Object.hasOwn(options, 'expectedPatientId') && Number(target?.id || 0) !== Number(options.expectedPatientId || 0)) {
    throw fail('PATIENT_RECORD_CHANGED', 'The patient record changed while you were registering. Please restart registration or contact the clinic.')
  }
  return target
}
module.exports = { resolveRegistrationPatient }
