const db = require('../db/connect')
const { normalizePatientProfileInput, getPatientProfileStatus } = require('./patientProfile')

const TABLE_MAP = {
  admin: 'admins',
  staff: 'staff',
  doctor: 'doctors',
  patient: 'patients',
}

const selectFieldsByRole = {
  admin: 'id, full_name, email, theme_preference, profile_image_url',
  staff: 'id, full_name, email, phone, theme_preference, profile_image_url',
  doctor: 'id, full_name, email, phone, specialty, theme_preference, profile_image_url',
  patient: 'id, full_name, email, phone, address, civil_status, COALESCE(gender, sex) AS gender, COALESCE(gender, sex) AS sex, DATE_FORMAT(birthdate, "%Y-%m-%d") AS birthdate, receive_promotions, is_profile_complete, theme_preference, profile_image_url',
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
    admin: ['full_name', 'theme_preference', 'profile_image_url'],
    staff: ['full_name', 'phone', 'theme_preference', 'profile_image_url'],
    doctor: ['full_name', 'phone', 'specialty', 'theme_preference', 'profile_image_url'],
    patient: ['full_name', 'phone', 'address', 'civil_status', 'gender', 'birthdate', 'theme_preference', 'profile_image_url', 'email', 'receive_promotions'],
  }

  if (role === 'patient') {
    const current = await getSettings(role, id)
    if (!current) return null

    const normalized = normalizePatientProfileInput(payload)
    const nextValues = {
      full_name: payload.full_name === undefined ? current.full_name : (payload.full_name || '').trim() || current.full_name,
      phone: payload.phone === undefined ? current.phone : (payload.phone || '').trim() || current.phone,
      address: payload.address === undefined ? current.address : normalized.address,
      civil_status: payload.civil_status === undefined ? current.civil_status : normalized.civil_status,
      gender: payload.gender === undefined ? current.gender : normalized.gender,
      birthdate: payload.birthdate === undefined ? current.birthdate : normalized.birthdate,
      email: payload.email === undefined ? current.email : normalized.email,
      receive_promotions: payload.receive_promotions === undefined ? Boolean(current.receive_promotions) : Boolean(payload.receive_promotions),
      theme_preference: payload.theme_preference === undefined ? current.theme_preference : payload.theme_preference,
      profile_image_url: payload.profile_image_url === undefined ? current.profile_image_url : payload.profile_image_url,
    }

    if (nextValues.email) {
      const [existingEmail] = await db.query(
        'SELECT id FROM patients WHERE email = ? AND id <> ?',
        [nextValues.email, id]
      )
      if (existingEmail.length > 0) {
        throw new Error('That email address is already linked to another patient account.')
      }
    }

    const status = getPatientProfileStatus({
      birthdate: nextValues.birthdate,
      gender: nextValues.gender,
      address: nextValues.address,
    })

    await db.query(
      `UPDATE patients
       SET full_name = ?, phone = ?, address = ?, civil_status = ?, gender = ?, sex = ?, birthdate = ?, email = ?,
           receive_promotions = ?, is_profile_complete = ?, theme_preference = ?, profile_image_url = ?
       WHERE id = ?`,
      [
        nextValues.full_name,
        nextValues.phone,
        nextValues.address,
        nextValues.civil_status,
        nextValues.gender,
        nextValues.gender,
        nextValues.birthdate,
        nextValues.email,
        nextValues.receive_promotions ? 1 : 0,
        status.is_profile_complete ? 1 : 0,
        nextValues.theme_preference,
        nextValues.profile_image_url,
        id,
      ]
    )

    return getSettings(role, id)
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
