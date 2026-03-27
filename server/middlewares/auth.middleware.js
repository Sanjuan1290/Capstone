// server/middlewares/auth.middleware.js
// FIX #1 — Reads the role-specific cookie based on the URL path segment.
// e.g. /api/v1/admin/... → reads admin_token
//      /api/v1/staff/... → reads staff_token

const jwt = require('jsonwebtoken')

const verifyToken = (req, res, next) => {
  // Determine role from URL: /api/v1/{role}/...
  const role = req.originalUrl.split('/')[3]
  const cookieName = `${role}_token`
  const token = req.cookies[cookieName]

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized.' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

module.exports = verifyToken