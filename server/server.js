require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors = require('cors')
const app = express()
const db = require('./db/connect')

const patientRouter = require('./routers/patient.router')
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())


app.use('/api/v1/patient', patientRouter)

app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ message: 'Something went wrong!', error: err.message})
})

const start = async () => {
    try {
        const [rows] = await db.query('SELECT 1 AS result')
        console.log(`✅ MySQL connected! Test query result: ${rows[0].result}`);

        app.listen(PORT, () => {
            console.log(`Server running on PORT: ${PORT}`)
        })
    } catch (err) {
        console.error('Failed to start server', err)
    }
}
start()