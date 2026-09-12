const { verifySessionToken, findAuthenticatedRequestSession } = require('../utils/sessionSecurity')

const authenticate = (cookieName) => async (req, res, next) => {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ message: 'Not authenticated.' })
  try {
    const expectedRole = String(cookieName || '').replace(/_token$/, '')
    req.user = await verifySessionToken(token, expectedRole)
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

authenticate.any = authenticateAny
module.exports = authenticate



