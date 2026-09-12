const jwt = require('jsonwebtoken')
const db = require('../db/connect')
const generateCookie = require('./generateCookie')

const ROLE_CONFIG = {
  admin: { table: 'admins', activeSql: '1=1', cookie: 'admin_token' },
  staff: { table: 'staff', activeSql: "status = 'active'", cookie: 'staff_token' },
  doctor: { table: 'doctors', activeSql: 'is_active = 1', cookie: 'doctor_token' },
  patient: { table: 'patients', activeSql: '1=1', cookie: 'patient_token' },
}

const loadSessionAccount = async (role, id, executor = db) => {
  const config = ROLE_CONFIG[role]
  if (!config || !Number(id)) return null
  const [rows] = await executor.query(
    `SELECT id, COALESCE(session_version, 1) AS session_version
     FROM ${config.table}
     WHERE id = ? AND ${config.activeSql}
     LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

const makeSessionToken = async (role, id, executor = db) => {
  const account = await loadSessionAccount(role, id, executor)
  if (!account) throw Object.assign(new Error('Account is inactive or unavailable.'), { statusCode: 401 })
  return jwt.sign(
    { id: Number(id), role, session_version: Number(account.session_version || 1) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.SESSION_TTL || '7d' }
  )
}

const issueSession = async (res, role, id, executor = db) => {
  const token = await makeSessionToken(role, id, executor)
  generateCookie(res, token, role)
  return token
}

const verifySessionToken = async (token, expectedRole = null, executor = db) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET)
  if (!decoded?.id || !decoded?.role || !ROLE_CONFIG[decoded.role]) {
    throw Object.assign(new Error('Invalid session.'), { statusCode: 401 })
  }
  if (expectedRole && decoded.role !== expectedRole) {
    throw Object.assign(new Error('Invalid session role.'), { statusCode: 401 })
  }
  const account = await loadSessionAccount(decoded.role, decoded.id, executor)
  if (!account) throw Object.assign(new Error('Account is inactive or unavailable.'), { statusCode: 401 })
  if (Number(decoded.session_version || 0) !== Number(account.session_version || 1)) {
    throw Object.assign(new Error('Session has been revoked.'), { statusCode: 401 })
  }
  return { ...decoded, session_version: Number(account.session_version || 1) }
}

const revokeSessions = async (role, id, executor = db) => {
  const config = ROLE_CONFIG[role]
  if (!config) return
  await executor.query(`UPDATE ${config.table} SET session_version = COALESCE(session_version, 1) + 1 WHERE id = ?`, [id])
}

const findAuthenticatedRequestSession = async (req) => {
  for (const [role, config] of Object.entries(ROLE_CONFIG)) {
    const token = req.cookies?.[config.cookie]
    if (!token) continue
    try {
      const user = await verifySessionToken(token, role)
      return { role, user, cookieName: config.cookie }
    } catch {
      // Keep checking in case another valid role cookie is present.
    }
  }
  return null
}

module.exports = { ROLE_CONFIG, loadSessionAccount, makeSessionToken, issueSession, verifySessionToken, revokeSessions, findAuthenticatedRequestSession }



