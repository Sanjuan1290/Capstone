const db = require('../db/connect')

const getAccountDirectory = async (req, res) => {
  const [staff, doctors] = await Promise.all([
    db.query(`SELECT id, full_name, email, phone, status, created_at
              FROM staff WHERE branch_id=? ORDER BY full_name ASC`,[req.branchId]),
    db.query(`SELECT id, full_name, email, phone, specialty, clinic_type, prc_license, is_active, created_at
              FROM doctors WHERE branch_id=? ORDER BY full_name ASC`,[req.branchId]),
  ])
  res.json({ staff: staff[0], doctors: doctors[0] })
}

module.exports = { getAccountDirectory }

