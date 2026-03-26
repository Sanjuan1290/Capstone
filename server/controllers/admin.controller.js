const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const login = async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email])
  if (rows.length === 0) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const admin = rows[0]
  const match = await bcrypt.compare(password, admin.password)
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const token = jwt.sign(
    { id: admin.id, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  generateCookie(res, token)

  res.status(200).json({
    message: 'Login successful.',
    user: { id: admin.id, full_name: admin.full_name, email: admin.email, role: 'admin' }
  })
}

const checkAuth = async (req, res) => {
  const token = req.cookies.token
  if (!token) return res.status(200).json({ authenticated: false })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') return res.status(200).json({ authenticated: false })

    const [rows] = await db.query(
      'SELECT id, full_name, email FROM admins WHERE id = ?',
      [decoded.id]
    )
    if (rows.length === 0) return res.status(200).json({ authenticated: false })

    res.status(200).json({ authenticated: true, user: { ...rows[0], role: 'admin' } })
  } catch {
    res.status(200).json({ authenticated: false })
  }
}

const logout = (req, res) => {
  res.clearCookie('token')
  res.status(200).json({ message: 'Logged out.' })
}

module.exports = { login, checkAuth, logout }