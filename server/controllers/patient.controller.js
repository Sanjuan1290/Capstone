const db = require('../db/connect')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey"

// ================= REGISTER =================
const register = async (req, res) => {
  console.log('registering patient');
  try {
    const { fullName, birthdate, sex, civilStatus, phone, address, email, password, confirmPassword } = req.body

    if (!fullName || !birthdate || !sex || !civilStatus || !phone || !address || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" })
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" })
    }

    const [existing] = await db.query("SELECT id FROM patients WHERE email = ?", [email])
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already registered" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const [result] = await db.query(
      `INSERT INTO patients
      (full_name, birthdate, sex, civil_status, phone, address, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, birthdate, sex, civilStatus, phone, address, email, hashedPassword]
    )

    const token = jwt.sign({ id: result.insertId, email }, JWT_SECRET, { expiresIn: '7d' })
    generateCookie(res, token)

    res.status(201).json({
      message: "Patient registered successfully",
      user: { id: result.insertId, fullName, email }
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

// ================= LOGIN =================
const login = async (req, res) => {
  console.log('patient logging in...');
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    const [rows] = await db.query("SELECT * FROM patients WHERE email = ?", [email])
    if (rows.length === 0) {
      return res.status(400).json({ message: "User not found" })
    }

    const user = rows[0]

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
    generateCookie(res, token)

    res.json({
      message: "Login successful",
      user: { id: user.id, fullName: user.full_name, email: user.email }
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

// ================= CHECK AUTH =================
const checkAuth = (req, res) => {
  try {
    const token = req.cookies.token

    if (!token) {
      return res.json({ authenticated: false })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    return res.json({
      authenticated: true,
      user: {
        id: decoded.id,
        email: decoded.email,
      },
    })
  } catch (err) {
    return res.json({ authenticated: false })
  }
}

// ================= LOGOUT =================
const logout = async (req, res) => {
  try {
    // Clear the cookie by setting it to empty with immediate expiry
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })

    return res.json({ message: "Logged out successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
}


const bookAppointment = async(req, res) => {

}

const getAppointmentList = async(req, res) => {
  const { name, reason, Id, filter } = req.params //filter = Confirmed, Pending, Completed, Cancelled else All
}

const getAppointmentHistory = async(req, res) => {

}


module.exports = { register, login, checkAuth, logout }