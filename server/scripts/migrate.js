require('dotenv').config()
const db = require('../db/connect')
const { ensureAppSchema } = require('../utils/schema')

const run = async () => {
  try {
    await ensureAppSchema()
    const [rows] = await db.query('SELECT 1 AS result')
    console.log(`Migration/schema verification complete. Database test: ${rows[0].result}`)
    process.exitCode = 0
  } catch (error) {
    console.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await db.end().catch(() => {})
  }
}

run()
