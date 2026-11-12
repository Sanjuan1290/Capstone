// Doctor identifiers belong to one account across all clinic branches.
const normalizePrcLicense = value => String(value || '').trim().toUpperCase()
const normalizeDoctorEmail = value => String(value || '').trim().toLowerCase()

const findDoctorIdentityConflict = async (executor, { email, phone, prc_license }, excludeId = 0) => {
  const [[row]] = await executor.query(
    `SELECT id,email,phone,prc_license FROM doctors
     WHERE id <> ? AND (LOWER(TRIM(email))=? OR phone=? OR UPPER(TRIM(prc_license))=?)
     LIMIT 1`,
    [Number(excludeId) || 0, email, phone, prc_license]
  )
  if (!row) return null
  if (normalizeDoctorEmail(row.email) === email) return { field: 'email', message: 'That email is already used by another doctor.' }
  if (String(row.phone || '') === phone) return { field: 'phone', message: 'That mobile number is already used by another doctor.' }
  return { field: 'prc_license', message: 'That PRC license number is already used by another doctor.' }
}

const handleDoctorUniqueIndexError = (error, res) => {
  if (!['ER_DUP_ENTRY', 'ER_DUP_KEY'].includes(error?.code) && Number(error?.errno) !== 1062) return false
  const key = String(error.sqlMessage || error.message || '').toLowerCase()
  const field = key.includes('prc') ? 'prc_license' : key.includes('phone') ? 'phone' : key.includes('email') ? 'email' : null
  const labels = { prc_license: 'PRC license number', phone: 'mobile number', email: 'email address' }
  res.status(409).json({code:'DOCTOR_IDENTIFIER_IN_USE',field,message:field ? `That ${labels[field]} is already used by another doctor.` : 'A doctor already uses one of these contact or license details.'})
  return true
}

module.exports = { normalizePrcLicense, normalizeDoctorEmail, findDoctorIdentityConflict, handleDoctorUniqueIndexError }
