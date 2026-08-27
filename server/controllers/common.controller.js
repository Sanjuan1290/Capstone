const { getNotifications, markNotificationRead } = require('../utils/notifications')
const { getSettings, updateSettings } = require('../utils/accountSettings')
const { getLandingPageContent, updateLandingPageContent } = require('../utils/landingPageContent')
const db = require('../db/connect')

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

module.exports = {
  listNotifications,
  readNotification,
  readAllNotifications,
  getMySettings,
  saveMySettings,
  getPublicLandingPage,
  getPublicClinicSettings,
  getAdminLandingPage,
  saveAdminLandingPage,
}


