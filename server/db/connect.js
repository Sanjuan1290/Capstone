// db.js
const mysql = require("mysql2/promise");

// All clinic dates and times are Philippine time. MySQL NOW(), CURDATE() and
// TIMESTAMP columns follow the *session* time zone, so every pooled connection
// is pinned to the clinic offset. Without this, a database hosted in UTC would
// write NOW() values 8 hours behind values computed by getClinicDateTimeSql().
// Asia/Manila has no daylight saving time, so a fixed offset is safe.
const DB_SESSION_TIME_ZONE = /^[+-]\d{2}:\d{2}$/.test(String(process.env.DB_TIME_ZONE || ''))
  ? process.env.DB_TIME_ZONE
  : '+08:00'

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  timezone: DB_SESSION_TIME_ZONE,
});

// Runs once per new physical connection, before the connection is handed to any
// caller. Commands on one connection execute in order, so no query can run first.
db.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [DB_SESSION_TIME_ZONE], (error) => {
    if (error) console.error('[db] Failed to set session time zone:', error.message)
  })
})

db.DB_SESSION_TIME_ZONE = DB_SESSION_TIME_ZONE

module.exports = db;
