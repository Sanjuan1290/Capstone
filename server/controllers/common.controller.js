const { getNotifications, markNotificationRead } = require('../utils/notifications')
const { getSettings, updateSettings } = require('../utils/accountSettings')
const { getLandingPageContent, updateLandingPageContent } = require('../utils/landingPageContent')
const db = require('../db/connect')
const { requestPasswordChangeCode, changeWithCode, completeRequiredChange, requestPatientPhoneChange, confirmPatientPhoneChange, createSecurityCode, verifySecurityCode } = require('../utils/accountSecurity')
const { sendAccountSecurityOtp } = require('../utils/emailService')
const { writeAuditLog } = require('../utils/audit')

const listNotifications = async (req, res) => {
  const rows = await getNotifications(req.user.role, req.user.id, req.query.limit || 20)
  const unread = rows.filter(row => !row.is_read).length
  res.json({ items: rows, unread })
}

const readNotification = async (req, res) => {
  await markNotificationRead(req.params.id, req.user.role, req.user.id)
  res.json({ message: 'Notification marked as read.' })
}

const readAllNotifications = async (req, res) => {
  await db.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE target_role = ?
       AND (target_user_id = ? OR target_user_id IS NULL)`,
    [req.user.role, req.user.id]
  )
  res.json({ success: true })
}

const getMySettings = async (req, res) => {
  const settings = await getSettings(req.user.role, req.user.id)
  if (!settings) return res.status(404).json({ message: 'Account not found.' })
  res.json(settings)
}

const saveMySettings = async (req, res) => {
  const settings = await updateSettings(req.user.role, req.user.id, req.body || {})
  res.json(settings)
}


const requestMySettingsVerification = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator account required.' })
  const current = await getSettings('admin', req.user.id)
  if (!current?.email) return res.status(400).json({ message: 'Your current administrator email is required for verification.' })
  const payload = {
    full_name: String(req.body?.full_name ?? current.full_name).trim(),
    email: String(req.body?.email ?? current.email).trim().toLowerCase(),
    profile_image_url: req.body?.profile_image_url ?? current.profile_image_url,
  }
  if (!payload.full_name || !payload.email) return res.status(400).json({ message: 'Name and email are required.' })
  const [duplicates] = await db.query('SELECT id FROM admins WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1', [payload.email, req.user.id])
  if (duplicates.length) return res.status(409).json({ message: 'That email is already used by another administrator.' })
  try {
    const code = await createSecurityCode({ role: 'admin', accountId: req.user.id, purpose: 'settings_change_current', payload })
    await sendAccountSecurityOtp(current.email, current.full_name, code)
    res.json({ message: 'Verification code sent to your current administrator email.', stage: 'current_email' })
  } catch (err) { res.status(err.statusCode || 400).json({ message: err.message }) }
}

const confirmMySettingsVerification = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator account required.' })
  const stage = String(req.body?.stage || 'current_email')
  try {
    if (stage === 'current_email') {
      const verified = await verifySecurityCode({ role: 'admin', accountId: req.user.id, purpose: 'settings_change_current', code: req.body?.code })
      const current = await getSettings('admin', req.user.id)
      const payload = verified.payload || {}
      if (String(payload.email || '').toLowerCase() !== String(current.email || '').toLowerCase()) {
        const code = await createSecurityCode({ role: 'admin', accountId: req.user.id, purpose: 'settings_change_new_email', payload })
        await sendAccountSecurityOtp(payload.email, payload.full_name || current.full_name, code)
        return res.json({ message: 'Current email verified. A second code was sent to the new email address.', stage: 'new_email', requires_new_email: true })
      }
      const settings = await updateSettings('admin', req.user.id, payload)
      await writeAuditLog({ userId: req.user.id, userRole: 'admin', action: 'account.profile_updated', entityType: 'admin', entityId: req.user.id, newValues: { full_name: payload.full_name }, ipAddress: req.ip || null }).catch(() => {})
      return res.json({ message: 'Personal information updated.', stage: 'complete', settings })
    }
    if (stage === 'new_email') {
      const verified = await verifySecurityCode({ role: 'admin', accountId: req.user.id, purpose: 'settings_change_new_email', code: req.body?.code })
      const payload = verified.payload || {}
      const [duplicates] = await db.query('SELECT id FROM admins WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1', [payload.email, req.user.id])
      if (duplicates.length) return res.status(409).json({ message: 'That email is already used by another administrator.' })
      const settings = await updateSettings('admin', req.user.id, payload)
      await writeAuditLog({ userId: req.user.id, userRole: 'admin', action: 'security.admin_email_changed', entityType: 'admin', entityId: req.user.id, newValues: { email: payload.email }, ipAddress: req.ip || null }).catch(() => {})
      return res.json({ message: 'New email verified and personal information updated.', stage: 'complete', settings })
    }
    return res.status(400).json({ message: 'Invalid verification stage.' })
  } catch (err) { return res.status(err.statusCode || 400).json({ message: err.message }) }
}

const getPublicLandingPage = async (req, res) => {
  const landingPage = await getLandingPageContent()
  res.json(landingPage)
}


const getPublicClinicSettings = async (req, res) => {
  const [rows] = await db.query(
    'SELECT clinic_name, address, phone, email, report_footer, receipt_footer, updated_at FROM clinic_settings WHERE id = 1 LIMIT 1'
  ).catch(() => [[]])
  res.json(rows[0] || {
    clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
    address: 'A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna',
    phone: null,
    email: null,
  })
}

const getAdminLandingPage = async (req, res) => {
  const landingPage = await getLandingPageContent()
  res.json(landingPage)
}

const saveAdminLandingPage = async (req, res) => {
  const saved = await updateLandingPageContent(req.body || {})
  res.json(saved)
}


const requestMyPasswordCode = async (req, res) => {
  try {
    const result = await requestPasswordChangeCode(
      req.user.role,
      req.user.id,
      req.body?.current_password,
      req.body?.new_password,
    )
    res.json({ message: `Verification code sent by ${result.channel}.`, channel: result.channel })
  } catch (err) { res.status(err.statusCode || 400).json({ message: err.message }) }
}

const changeMyPassword = async (req, res) => {
  try {
    await changeWithCode(req.user.role, req.user.id, req.body?.code, res)
    await writeAuditLog({ userId: req.user.id, userRole: req.user.role, action: 'password_changed', entityType: req.user.role, entityId: req.user.id, ipAddress: req.ip || null }).catch(() => {})
    res.json({ message: 'Password changed successfully.' })
  } catch (err) { res.status(400).json({ message: err.message }) }
}

const completeRequiredPasswordChange = async (req, res) => {
  try {
    await completeRequiredChange(req.user.role, req.user.id, req.body?.new_password, res)
    await writeAuditLog({ userId: req.user.id, userRole: req.user.role, action: 'first_password_change_completed', entityType: req.user.role, entityId: req.user.id, ipAddress: req.ip || null }).catch(() => {})
    res.json({ message: 'Password created successfully.' })
  } catch (err) { res.status(400).json({ message: err.message }) }
}


const requestMyPhoneChange = async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required.' })
  try {
    await requestPatientPhoneChange(req.user.id, req.body?.phone)
    res.json({ message: 'Verification code sent to the new mobile number.' })
  } catch (err) { res.status(err.statusCode || 400).json({ message: err.message }) }
}

const confirmMyPhoneChange = async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required.' })
  try {
    const phone = await confirmPatientPhoneChange(req.user.id, req.body?.code, res)
    await writeAuditLog({ userId: req.user.id, userRole: 'patient', action: 'security.phone_changed', entityType: 'patient', entityId: req.user.id, newValues: { phone }, ipAddress: req.ip || null }).catch(() => {})
    res.json({ message: 'Mobile number changed successfully.', phone })
  } catch (err) { res.status(err.statusCode || 400).json({ message: err.message }) }
}

const completePatientOnboarding = async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ message: 'Patient account required.' })
  await db.query('UPDATE patients SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()) WHERE id = ?', [req.user.id])
  res.json({ message: 'Onboarding completed.' })
}

module.exports = {
  listNotifications,
  readNotification,
  readAllNotifications,
  getMySettings,
  saveMySettings,
  requestMySettingsVerification,
  confirmMySettingsVerification,
  requestMyPasswordCode,
  changeMyPassword,
  completeRequiredPasswordChange,
  completePatientOnboarding,
  requestMyPhoneChange,
  confirmMyPhoneChange,
  getPublicLandingPage,
  getPublicClinicSettings,
  getAdminLandingPage,
  saveAdminLandingPage,
}
