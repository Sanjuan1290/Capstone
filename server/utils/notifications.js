const db = require('../db/connect')

const createNotification = async ({
  target_role,
  target_user_id = null,
  type,
  title,
  message,
  reference_type = null,
  reference_id = null,
}) => {
  await db.query(
    `INSERT INTO notifications
      (target_role, target_user_id, type, title, message, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [target_role, target_user_id, type, title, message, reference_type, reference_id]
  )
}

const notifyRoles = async (roles, payload) => {
  await Promise.all(roles.map(role => createNotification({ ...payload, target_role: role })))
}

const getNotifications = async (role, userId = null, limit = 20) => {
  const [rows] = await db.query(
    `SELECT *
     FROM notifications
     WHERE target_role = ?
       AND (target_user_id IS NULL OR target_user_id = ?)
     ORDER BY created_at DESC
     LIMIT ?`,
    [role, userId, Number(limit) || 20]
  )
  return rows
}

const markNotificationRead = async (id, role, userId = null) => {
  await db.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE id = ?
       AND target_role = ?
       AND (target_user_id IS NULL OR target_user_id = ?)`,
    [id, role, userId]
  )
}

module.exports = {
  createNotification,
  notifyRoles,
  getNotifications,
  markNotificationRead,
}
