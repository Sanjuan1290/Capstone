const { verifySessionToken, findAuthenticatedRequestSession } = require('../utils/sessionSecurity')

const authenticate = (cookieName) => async (req, res, next) => {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ message: 'Not authenticated.' })
  try {
    const expectedRole = cookieName === 'superadmin_token' ? 'admin' : String(cookieName || '').replace(/_token$/, '')
    req.user = await verifySessionToken(token, expectedRole)
    if (cookieName === 'superadmin_token' && req.user.account_role !== 'superadmin') {
      return res.status(403).json({ code: 'SUPERADMIN_REQUIRED', message: 'Super Admin access required.' })
    }
    if (cookieName === 'admin_token' && req.user.account_role === 'superadmin') {
      return res.status(403).json({ code: 'BRANCH_ADMIN_REQUIRED', message: 'Use the Super Admin portal.' })
    }
    req.authCookieName = cookieName
    next()
  } catch (err) {
    res.clearCookie(cookieName)
    console.warn('[security] rejected session', { cookieName, path: req.originalUrl, ip: req.ip, reason: err.message })
    return res.status(401).json({ code: 'SESSION_INVALID', message: 'Session expired or was revoked. Please log in again.' })
  }
}

const authenticateAny = async (req, res, next) => {
  try {
    const session = await findAuthenticatedRequestSession(req)
    if (!session) return res.status(401).json({ message: 'Not authenticated.' })
    req.user = session.user
    req.authCookieName = session.cookieName
    next()
  } catch (err) {
    next(err)
  }
}

// Pick a signed cookie explicitly based on the portal, not whichever tab last signed in.
authenticate.adminContext = (superAdminOnly = false) => (req, res, next) => {
  const portal = superAdminOnly || req.get('x-admin-portal') === 'superadmin' || req.query?.portal === 'superadmin' ? 'superadmin_token' : 'admin_token'
  return authenticate(portal)(req, res, next)
}
authenticate.any = authenticateAny
module.exports = authenticate

