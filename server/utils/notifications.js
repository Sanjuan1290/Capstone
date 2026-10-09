const db = require('../db/connect')
const { broadcast } = require('./sse')

const createNotification = async ({
  target_role,
  target_user_id = null,
  type,
  title,
  message,
  reference_type = null,
  reference_id = null,
  body = null,
  link = null,
  branch_id = null,
}) => {
  // Resolve the physical branch from the referenced operation. Never silently
  // deliver a Branch B appointment notification to Branch A.
  let resolvedBranchId = Number(branch_id) || null
  const referenceTables = { appointment:'appointments', billing:'billing_records', billing_record:'billing_records', supply_request:'supply_requests', supply_request_group:'supply_request_groups', inventory:'inventory' }
  if (!resolvedBranchId && reference_id && referenceTables[reference_type]) {
    const [[owner]] = await db.query(`SELECT branch_id FROM ${referenceTables[reference_type]} WHERE id=? LIMIT 1`, [reference_id])
    resolvedBranchId = Number(owner?.branch_id) || null
  }
  // Historical global notifications keep their legacy branch assignment. New
  // operations should provide a branch_id or a supported record reference.
  const [result] = await db.query(
    `INSERT INTO notifications
      (target_role, target_user_id, type, title, message, reference_type, reference_id, body, link, branch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [target_role, target_user_id, type, title, message, reference_type, reference_id, body, link, resolvedBranchId || 0]
  )

  const notification = {
    id: result.insertId,
    target_role,
    target_user_id,
    type,
    title,
    message,
    reference_type,
    reference_id,
    body,
    link,
    branch_id: resolvedBranchId || 0,
  }
  broadcast(target_user_id ? [target_role, `${target_role}_${target_user_id}`] : target_role, 'notification_created', notification)
  return notification
}

const notifyRoles = async (roles, payload) => {
  await Promise.all(roles.map(role => createNotification({ ...payload, target_role: role })))
}

const getNotifications = async (role, userId = null, limit = 20) => {
  const requested = Number(limit)
  const safeLimit = Math.min(100, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 20))
  const [rows] = await db.query(
    `SELECT *
     FROM notifications
     WHERE target_role = ?
       AND (target_user_id IS NULL OR target_user_id = ?)
     ORDER BY created_at DESC
     LIMIT ?`,
    [role, userId, safeLimit]
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

