const { loadStaffPermissions, STAFF_PERMISSION_KEYS } = require('../utils/staffPermissions')

const VALID = new Set(STAFF_PERMISSION_KEYS)

const getRequestPermissions = async (req) => {
  if (Array.isArray(req.staffPermissions)) return req.staffPermissions
  req.staffPermissions = await loadStaffPermissions(req.user?.id)
  return req.staffPermissions
}

const deny = (res, required) => res.status(403).json({
  code: 'STAFF_PERMISSION_REQUIRED',
  message: 'Your staff account does not have access to this feature. Contact an Administrator if you need access.',
  required_permissions: required,
})

const requireStaffPermission = (...permissions) => {
  const required = permissions.flat().map(String).filter((key) => VALID.has(key))
  if (!required.length) throw new Error('requireStaffPermission requires at least one valid permission key.')
  return async (req, res, next) => {
    try {
      const granted = await getRequestPermissions(req)
      if (!required.every((key) => granted.includes(key))) return deny(res, required)
      next()
    } catch (error) { next(error) }
  }
}

const requireAnyStaffPermission = (...permissions) => {
  const required = permissions.flat().map(String).filter((key) => VALID.has(key))
  if (!required.length) throw new Error('requireAnyStaffPermission requires at least one valid permission key.')
  return async (req, res, next) => {
    try {
      const granted = await getRequestPermissions(req)
      if (!required.some((key) => granted.includes(key))) return deny(res, required)
      next()
    } catch (error) { next(error) }
  }
}

module.exports = { requireStaffPermission, requireAnyStaffPermission }
