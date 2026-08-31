require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const app = express()
const db = require('./db/connect')
const { ensureAppSchema } = require('./utils/schema')
const { registerClient, writeEvent, broadcast } = require('./utils/sse')
const authenticate = require('./middlewares/auth.middleware')
const { securityHeaders, originGuard, getAllowedOrigins } = require('./middlewares/httpSecurity.middleware')

const patientRouter = require('./routers/patient.router')
const adminRouter = require('./routers/admin.router')
const staffRouter = require('./routers/staff.router')
const doctorRouter = require('./routers/doctor.router')
const queueRouter = require('./routers/queue.router')
const authRouter = require('./routers/auth.router')

const PORT = process.env.PORT || 3000
const allowedOrigins = getAllowedOrigins()

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
app.use(securityHeaders)
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }))
app.use(express.urlencoded({ extended: false, limit: process.env.FORM_BODY_LIMIT || '256kb' }))
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed by CORS policy.'))
  },
  credentials: true,
}))
app.use(cookieParser())
app.use(originGuard)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Authenticated SSE only. Role/user identity comes from the verified session cookie,
// never from query-string values controlled by the browser.
app.get('/api/events', authenticate.any, (req, res) => {
  const role = req.user.role
  const userId = req.user.id

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const unregister = registerClient(role, userId, res)
  writeEvent(res, 'connected', { role, userId, connectedAt: new Date().toISOString() })

  const ping = setInterval(() => {
    if (res.writableEnded) return
    res.write(': ping\n\n')
  }, 30000)

  req.on('close', () => {
    clearInterval(ping)
    unregister()
    if (!res.writableEnded) res.end()
  })
})

app.use('/api/patient', patientRouter)
app.use('/api/admin', adminRouter)
app.use('/api/staff', staffRouter)
app.use('/api/doctor', doctorRouter)
app.use('/api/auth', authRouter)
app.use('/api/queue', queueRouter)

app.use((err, req, res, next) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  console.error('[server-error]', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    code: err.code,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  })
  if (res.headersSent) return next(err)

  const status = Number(err.statusCode || err.status) || 500
  const expose = status >= 400 && status < 500 && !/^ER_/.test(String(err.code || ''))
  const message = expose ? (err.publicMessage || err.message || 'Request could not be completed.') : 'Something went wrong while processing your request.'
  res.status(status).json({ message, request_id: requestId })
})

const start = async () => {
  try {
    if (String(process.env.RUN_SCHEMA_MIGRATIONS_ON_STARTUP || 'false').toLowerCase() === 'true') {
      console.warn('[startup] RUN_SCHEMA_MIGRATIONS_ON_STARTUP=true; applying schema migrations before serving traffic.')
      await ensureAppSchema()
    }
    const [rows] = await db.query('SELECT 1 AS result')
    console.log(`MySQL connected. Test query: ${rows[0].result}`)
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      require('./utils/reminder')
    })
  } catch (err) {
    console.error('Failed to start server:', err)
  }
}

if (require.main === module) start()

module.exports = { app, start, broadcast }
