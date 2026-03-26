require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const app = express()
const db = require('./db/connect')

const patientRouter = require('./routers/patient.router')
const adminRouter   = require('./routers/admin.router')
const staffRouter   = require('./routers/staff.router')
const doctorRouter  = require('./routers/doctor.router')

const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}))
app.use(cookieParser())

app.use('/api/v1/patient', patientRouter)
app.use('/api/v1/admin',   adminRouter)
app.use('/api/v1/staff',   staffRouter)
app.use('/api/v1/doctor',  doctorRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Something went wrong!', error: err.message })
})

const start = async () => {
  try {
    const [rows] = await db.query('SELECT 1 AS result')
    console.log(`✅ MySQL connected! Test query: ${rows[0].result}`)
    app.listen(PORT, () => console.log(`🚀 Server running on PORT: ${PORT}`))
  } catch (err) {
    console.error('❌ Failed to start server:', err)
  }
}

start()