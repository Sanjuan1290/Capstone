'use strict'

const PHONE_ALLOWED = /^[0-9+().\s-]+$/

function normalizePhilippinePhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!PHONE_ALLOWED.test(raw) || (raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) {
    const error = new Error('Enter a valid Philippine mobile or landline number.')
    error.code = 'INVALID_BRANCH_PHONE'
    error.statusCode = 400
    error.field = 'phone'
    throw error
  }
  const digits = raw.replace(/\D/g, '')
  let normalized = null
  if (raw.startsWith('+')) {
    if (/^639\d{9}$/.test(digits)) normalized = `+${digits}`
    else if (/^63[2-8]\d{7,9}$/.test(digits)) normalized = `+${digits}`
  } else if (/^09\d{9}$/.test(digits)) normalized = `+63${digits.slice(1)}`
  else if (/^639\d{9}$/.test(digits)) normalized = `+${digits}`
  else if (/^63[2-8]\d{7,9}$/.test(digits)) normalized = `+${digits}`
  else if (/^0[2-8]\d{7,9}$/.test(digits)) normalized = `+63${digits.slice(1)}`
  if (!normalized) {
    const error = new Error('Enter a valid Philippine mobile or landline number.')
    error.code = 'INVALID_BRANCH_PHONE'
    error.statusCode = 400
    error.field = 'phone'
    throw error
  }
  return normalized
}

function normalizeGoogleMapsUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const fail = () => { const error = new Error('Use a Google Maps sharing link from maps.app.goo.gl or google.com/maps.'); error.code='INVALID_BRANCH_MAPS_URL'; error.statusCode=400; error.field='google_maps_url'; throw error }
  if (raw.length > 2048) { const error = new Error('Google Maps link must be 2,048 characters or fewer.'); error.code='INVALID_BRANCH_MAPS_URL'; error.statusCode=400; error.field='google_maps_url'; throw error }
  let parsed
  try { parsed = new URL(raw) } catch { fail() }
  const host = parsed.hostname.toLowerCase()
  const isGoogleMapsHost = (host === 'maps.app.goo.gl' && /^\/[^/]+/.test(parsed.pathname)) || (host === 'goo.gl' && /^\/maps\/[^/]+/i.test(parsed.pathname)) || host === 'maps.google.com' || ((host === 'google.com' || host === 'www.google.com') && /^\/maps(?:\/|$)/i.test(parsed.pathname))
  if (parsed.protocol !== 'https:' || !isGoogleMapsHost || parsed.username || parsed.password || parsed.port) fail()
  return parsed.toString()
}

function validateBranchContact({ phone, email, address, google_maps_url } = {}) {
  const cleanPhone = normalizePhilippinePhone(phone)
  const cleanEmail = String(email ?? '').trim().toLowerCase()
  const cleanAddress = String(address ?? '').trim()
  if (cleanAddress.length > 255) {
    const error = new Error('Address must be 255 characters or fewer.')
    error.code = 'INVALID_BRANCH_ADDRESS'
    error.statusCode = 400
    error.field = 'address'
    throw error
  }
  if (cleanEmail && (cleanEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
    const error = new Error(cleanEmail.length > 160 ? 'Email address must be 160 characters or fewer.' : 'Enter a valid email address.')
    error.code = 'INVALID_BRANCH_EMAIL'
    error.statusCode = 400
    error.field = 'email'
    throw error
  }
  return { phone: cleanPhone, email: cleanEmail || null, address: cleanAddress || null, google_maps_url: normalizeGoogleMapsUrl(google_maps_url) }
}

module.exports = { normalizePhilippinePhone, normalizeGoogleMapsUrl, validateBranchContact }

