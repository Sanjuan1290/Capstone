const db = require('../db/connect')

const requirePasswordChangeCompleted = async (req, res, next) => {
  if (!['staff', 'doctor'].includes(req.user?.role)) return next()
  const table = req.user.role === 'staff' ? 'staff' : 'doctors'
  try {
    const [rows] = await db.query(`SELECT must_change_password FROM ${table} WHERE id = ? LIMIT 1`, [req.user.id])
    if (rows.length && Number(rows[0].must_change_password)) {
      return res.status(428).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must create a new password before continuing.' })
    }
    next()
  } catch (err) { next(err) }
}
module.exports = requirePasswordChangeCompleted
