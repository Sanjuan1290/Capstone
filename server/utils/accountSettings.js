const db = require('../db/connect')

const TABLE_MAP = {
  admin: 'admins',
  staff: 'staff',
  doctor: 'doctors',
  patient: 'patients',
}

const selectFieldsByRole = {
  admin: 'id, full_name, email, phone, theme_preference, profile_image_url',
  staff: 'id, full_name, email, phone, theme_preference, profile_image_url',
  doctor: 'id, full_name, email, phone, specialty, theme_preference, profile_image_url',
  patient: 'id, full_name, email, phone, address, civil_status, sex, DATE_FORMAT(birthdate, "%Y-%m-%d") AS birthdate, theme_preference, profile_image_url',
}

const getSettings = async (role, id) => {
  const table = TABLE_MAP[role]
  const fields = selectFieldsByRole[role]
  const [rows] = await db.query(`SELECT ${fields} FROM ${table} WHERE id = ?`, [id])
  return rows[0] || null
}

const updateSettings = async (role, id, payload) => {
  const table = TABLE_MAP[role]
  const allowedByRole = {
    admin: ['full_name', 'phone', 'theme_preference', 'profile_image_url'],
    staff: ['full_name', 'phone', 'theme_preference', 'profile_image_url'],
    doctor: ['full_name', 'phone', 'specialty', 'theme_preference', 'profile_image_url'],
    patient: ['full_name', 'phone', 'address', 'civil_status', 'sex', 'birthdate', 'theme_preference', 'profile_image_url'],
  }

  const allowed = allowedByRole[role]
  const entries = Object.entries(payload).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return getSettings(role, id)

  const setters = entries.map(([key]) => `${key} = ?`).join(', ')
  const values = entries.map(([, value]) => value || null)

  await db.query(`UPDATE ${table} SET ${setters} WHERE id = ?`, [...values, id])
  return getSettings(role, id)
}

module.exports = {
  getSettings,
  updateSettings,
}
