// Guests may view appointment updates only in their private booking page.
// This shared guard catches status changes triggered by staff, admins and expiry jobs.
const db = require('../db/connect')
const {normalizePhilippinePhone} = require('./phone')
const isGuestContact = async ({email,phone}={}) => {
  if (phone) {
    const normalized=normalizePhilippinePhone(phone)
    if (!normalized) return false
    const domestic=`0${normalized.slice(2)}`
    const [[row]]=await db.query(`SELECT id FROM patients WHERE consent_method='guest_online'
      AND phone IN (?,?) LIMIT 1`,[normalized,domestic])
    return Boolean(row)
  }
  if (email) {
    const value=String(email).trim().toLowerCase()
    if (!value)return false
    const [[row]]=await db.query(`SELECT id FROM patients WHERE consent_method='guest_online'
      AND LOWER(email)=? LIMIT 1`,[value])
    return Boolean(row)
  }
  return false
}
module.exports={isGuestContact}
