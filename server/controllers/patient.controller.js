const db = require('../db/connect')           // your mysql2 pool
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const generateCookie = require('../utils/generateCookie')

// Secret for JWT
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey"

// ================= REGISTER =================
const register = async (req, res) => {
  console.log('registering patient');
  try {
    const { fullName, birthdate, sex, civilStatus, phone, address, email, password, confirmPassword } = req.body

    // ✅ Validate all fields
    if (!fullName || !birthdate || !sex || !civilStatus || !phone || !address || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" })
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" })
    }

    // ✅ Check if email already exists
    const [existing] = await db.query("SELECT id FROM patients WHERE email = ?", [email])
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already registered" })
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // ✅ Insert patient into database
    const [result] = await db.query(
      `INSERT INTO patients
      (full_name, birthdate, sex, civil_status, phone, address, email, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, birthdate, sex, civilStatus, phone, address, email, hashedPassword]
    )
// ✅ Generate JWT
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
  console.log('patient loggin in...');
  try {
    const { email, password } = req.body

    // ✅ All fields required
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    // ✅ Find user
    const [rows] = await db.query("SELECT * FROM patients WHERE email = ?", [email])
    if (rows.length === 0) {
      return res.status(400).json({ message: "User not found" })
    }

    const user = rows[0]

    // ✅ Compare passwords
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // ✅ Generate JWT
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

const checkAuth = (req, res) => {
  try {
    // Read the token from the cookie
    const token = req.cookies.token;

    // If no token, user is not authenticated
    if (!token) {
      return res.json({ authenticated: false });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Send back user info (or just authenticated: true)
    return res.json({
      authenticated: true,
      user: {
        id: decoded.id,
        email: decoded.email,
      },
    });
  } catch (err) {
    // Invalid token or expired
    return res.json({ authenticated: false });
  }
};

module.exports = { register, login, checkAuth }