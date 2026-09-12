const { getNotifications, markNotificationRead } = require('../utils/notifications')
const { getSettings, updateSettings } = require('../utils/accountSettings')
const { getLandingPageContent, updateLandingPageContent } = require('../utils/landingPageContent')
const db = require('../db/connect')
const { requestCode, changeWithCode, completeRequiredChange, requestPatientPhoneChange, confirmPatientPhoneChange } = require('../utils/accountSecurity')
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
    const result = await requestCode(req.user.role, req.user.id)
    res.json({ message: `Verification code sent by ${result.channel}.`, channel: result.channel })
  } catch (err) { res.status(400).json({ message: err.message }) }
}

const changeMyPassword = async (req, res) => {
  try {
    await changeWithCode(req.user.role, req.user.id, req.body?.code, req.body?.new_password, res)
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



