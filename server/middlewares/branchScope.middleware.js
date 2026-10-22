// Resolve physical-branch ownership from the authenticated account, never from
// query/body/header input. Put this after verifyToken for staff and doctor.
const db = require('../db/connect')

const VALID_ROLE_TABLE = Object.freeze({ staff: 'staff', doctor: 'doctors', admin: 'admins' })
const isValidId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0

const branchScope = role => {
  const table = VALID_ROLE_TABLE[role]
  if (!table) throw new Error('Unsupported branch session role')
  return async (req, res, next) => {
    try {
      if (!isValidId(req.user?.id)) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session invalid.' })
      const active = role === 'staff' ? "a.status='active'" : role === 'doctor' ? 'a.is_active=1' : 'a.is_active=1'
      const [[account]] = await db.query(
        `SELECT a.branch_id, b.id AS branch_exists, b.name AS branch_name, b.is_active AS branch_active
         FROM ${table} a LEFT JOIN clinic_branches b ON b.id=a.branch_id
         WHERE a.id=? AND ${active} LIMIT 1`, [req.user.id]
      )
      if (!account || !isValidId(account.branch_id)) {
        return res.status(403).json({ code: 'ACCOUNT_BRANCH_UNASSIGNED', message: 'This account is inactive or has no assigned clinic branch.' })
      }
      if (!account.branch_exists || !Number(account.branch_active)) {
        return res.status(403).json({ code: 'BRANCH_INACTIVE', message: 'This clinic branch is inactive. Contact the Super Admin.' })
      }
      req.branchId = Number(account.branch_id)
      req.branch = { id: req.branchId, name: account.branch_name, is_active: 1 }
      next()
    } catch (error) { next(error) }
  }
}

module.exports = branchScope


