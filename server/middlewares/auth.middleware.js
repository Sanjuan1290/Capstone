// server/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken')

const authenticate = (cookieName) => (req, res, next) => {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ message: 'Not authenticated.' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.clearCookie(cookieName)
    return res.status(401).json({ message: 'Session expired. Please log in again.' })
  }
}

module.exports = authenticate