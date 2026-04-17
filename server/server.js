require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const app = express()
const db = require('./db/connect')
const { ensureAppSchema } = require('./utils/schema')

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
