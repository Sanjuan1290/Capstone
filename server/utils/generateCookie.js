// server/utils/generateCookie.js
// FIX #1 — Each role gets its own cookie name so sessions never conflict.
// admin_token | staff_token | doctor_token | patient_token

function generateCookie(res, token, role) {
  const cookieName = `${role}_token`

  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
}

module.exports = generateCookie