const db = require('../db/connect')

const STAFF_PERMISSION_KEYS = Object.freeze([
  'dashboard',
  'appointments',
  'patient_records',
  'doctor_schedules',
  'checkout',
  'billing',
  'inventory',
  'stock_transfers',
  'accounts',
  'system_setup',
  'reports',
  'audit_logs',
  'landing_page',
])

const STAFF_PERMISSION_SET = new Set(STAFF_PERMISSION_KEYS)

// Existing staff accounts historically had access to these operational areas.
// The migration seeds these permissions so the access-control rollout does not
// unexpectedly lock out active staff after deployment.
const DEFAULT_STAFF_PERMISSIONS = Object.freeze([
  'dashboard',
  'appointments',
  'patient_records',
  'doctor_schedules',
  'checkout',
  'inventory',
  'stock_transfers',
])

// Backwards-compatible alias used by older migration/tests.
const LEGACY_STAFF_PERMISSIONS = DEFAULT_STAFF_PERMISSIONS

const normalizeStaffPermissions = (value, { requireOne = false } = {}) => {
  const source = Array.isArray(value) ? value : []
  const normalized = [...new Set(source.map((entry) => String(entry || '').trim()).filter((entry) => STAFF_PERMISSION_SET.has(entry)))]
  if (requireOne && normalized.length === 0) {
    const error = new Error('Select at least one staff permission.')
    error.statusCode = 400
    error.code = 'STAFF_PERMISSION_REQUIRED'
    throw error
  }
  return normalized
}

const loadStaffPermissions = async (staffId, executor = db) => {
  if (!Number(staffId)) return []
  const [rows] = await executor.query(
    `SELECT permission_key
     FROM staff_permissions
     WHERE staff_id = ? AND granted = 1
     ORDER BY permission_key`,
    [Number(staffId)]
  )
  return rows.map((row) => row.permission_key).filter((key) => STAFF_PERMISSION_SET.has(key))
}

const replaceStaffPermissions = async (staffId, permissions, executor = db) => {
  const normalized = normalizeStaffPermissions(permissions, { requireOne: true })
  await executor.query('DELETE FROM staff_permissions WHERE staff_id = ?', [Number(staffId)])
  if (normalized.length) {
    const placeholders = normalized.map(() => '(?, ?, 1)').join(',')
    const params = normalized.flatMap((permission) => [Number(staffId), permission])
    await executor.query(
      `INSERT INTO staff_permissions (staff_id, permission_key, granted)
       VALUES ${placeholders}`,
      params
    )
  }
  return normalized
}

const samePermissionSet = (left = [], right = []) => {
  const a = normalizeStaffPermissions(left).sort()
  const b = normalizeStaffPermissions(right).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

module.exports = {
  STAFF_PERMISSION_KEYS,
  DEFAULT_STAFF_PERMISSIONS,
  LEGACY_STAFF_PERMISSIONS,
  normalizeStaffPermissions,
  loadStaffPermissions,
  replaceStaffPermissions,
  samePermissionSet,
}
