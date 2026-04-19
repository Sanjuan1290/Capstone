require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const app = express()
const db = require('./db/connect')
const { ensureAppSchema } = require('./utils/schema')
const { registerClient, writeEvent, broadcast } = require('./utils/sse')

const patientRouter = require('./routers/patient.router')
const adminRouter = require('./routers/admin.router')
const staffRouter = require('./routers/staff.router')
const doctorRouter = require('./routers/doctor.router')
const queueRouter = require('./routers/queue.router')
const authRouter = require('./routers/auth.router')

const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(cookieParser())

app.get('/api/events', (req, res) => {
  const { role, userId } = req.query
  if (!role) return res.status(400).json({ message: 'role is required' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.flushHeaders?.()

  const unregister = registerClient(role, userId, res)
  writeEvent(res, 'connected', { role, userId: userId || null, connectedAt: new Date().toISOString() })

  const ping = setInterval(() => {
    if (res.writableEnded) return
    res.write(': ping\n\n')
  }, 30000)

  req.on('close', () => {
    clearInterval(ping)
    unregister()
    res.end()
  })
})

app.use('/api/patient', patientRouter)
app.use('/api/admin', adminRouter)
app.use('/api/staff', staffRouter)
app.use('/api/doctor', doctorRouter)
app.use('/api/auth', authRouter)
app.use('/api/queue', queueRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Something went wrong!', error: err.message })
})

const start = async () => {
  try {
    await ensureAppSchema()
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

start()

module.exports = {
  app,
  broadcast,
}
