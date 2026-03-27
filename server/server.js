// server/server.js

require('dotenv').config()
require('express-async-errors')

const express      = require('express')
const cors         = require('cors')
const cookieParser = require('cookie-parser')

const app = express()
const db  = require('./db/connect')

const patientRouter = require('./routers/patient.router')
const adminRouter   = require('./routers/admin.router')
const staffRouter   = require('./routers/staff.router')
const doctorRouter  = require('./routers/doctor.router')
const queueRouter   = require('./routers/queue.router')
const authRouter    = require('./routers/auth.router')  // ✅ NEW

const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(cookieParser())

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/patient', patientRouter)
app.use('/api/v1/admin',   adminRouter)
app.use('/api/v1/staff',   staffRouter)
app.use('/api/v1/doctor',  doctorRouter)
app.use('/api/v1/auth',    authRouter)   // ✅ NEW — forgot/reset password for all roles
app.use('/api/queue',      queueRouter)  // public TV display, no /v1 prefix

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Something went wrong!', error: err.message })
})

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    const [rows] = await db.query('SELECT 1 AS result')
    console.log(`✅ MySQL connected! Test query: ${rows[0].result}`)
    app.listen(PORT, () => {
      console.log(`🚀 Server running on PORT: ${PORT}`)
      require('./utils/reminder') // daily appointment reminder job
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err)
  }
}

start()