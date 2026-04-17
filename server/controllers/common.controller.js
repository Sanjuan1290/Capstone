const { getNotifications, markNotificationRead } = require('../utils/notifications')
const { getSettings, updateSettings } = require('../utils/accountSettings')
const { getLandingPageContent, updateLandingPageContent } = require('../utils/landingPageContent')

const listNotifications = async (req, res) => {
  const rows = await getNotifications(req.user.role, req.user.id, req.query.limit || 20)
  const unread = rows.filter(row => !row.is_read).length
  res.json({ items: rows, unread })
}

const readNotification = async (req, res) => {
  await markNotificationRead(req.params.id, req.user.role, req.user.id)
  res.json({ message: 'Notification marked as read.' })
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
  getMySettings,
  saveMySettings,
  getPublicLandingPage,
  getAdminLandingPage,
  saveAdminLandingPage,
}
