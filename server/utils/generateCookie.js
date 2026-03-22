
function generateCookie(res, token) {
    
    // ✅ Set HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',       // true in production (HTTPS)
      sameSite: "Lax",     // recommended for login cookies
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })
}

module.exports = generateCookie