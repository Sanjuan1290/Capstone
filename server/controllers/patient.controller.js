const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const register = async (req, res) => {
  const { full_name, birthdate, sex, civil_status, phone, address, email, password } = req.body

  if (!full_name || !birthdate || !sex || !phone || !address || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' })
  }

  const [existing] = await db.query('SELECT id FROM patients WHERE email = ?', [email])
  if (existing.length > 0) {
    return res.status(409).json({ message: 'Email already registered.' })
  }

  const hashed = await bcrypt.hash(password, 10)

  const [result] = await db.query(
    `INSERT INTO patients (full_name, birthdate, sex, civil_status, phone, address, email, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [full_name, birthdate, sex, civil_status || null, phone, address, email, hashed]
  )

  const token = jwt.sign(
    { id: result.insertId, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(201).json({
    message: 'Registered successfully.',
    user: { id: result.insertId, full_name, email, role: 'patient' }
  })
}

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const [rows] = await db.query('SELECT * FROM patients WHERE email = ?', [email])
  if (rows.length === 0) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const patient = rows[0]
  const match = await bcrypt.compare(password, patient.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const token = jwt.sign(
    { id: patient.id, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(200).json({
    message: 'Login successful.',
    user: { id: patient.id, full_name: patient.full_name, email: patient.email, role: 'patient' }
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies.token
  if (!token) return res.status(200).json({ authenticated: false })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'patient') return res.status(200).json({ authenticated: false })

    const [rows] = await db.query(
      'SELECT id, full_name, email FROM patients WHERE id = ?',
      [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })

    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'patient' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('token')
  res.status(200).json({ message: 'Logged out.' })
}

module.exports = { register, login, checkAuth, logout }