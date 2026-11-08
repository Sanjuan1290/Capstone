const PHONE_ALLOWED = /^[0-9+().\s-]+$/

/**
 * Normalize a Philippine mobile or landline number to E.164.
 * Returns null for an empty optional value and throws for malformed values.
 */
export function normalizePhilippinePhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!PHONE_ALLOWED.test(raw) || (raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) {
    throw new Error('Enter a valid Philippine mobile or landline number.')
  }

  const digits = raw.replace(/\D/g, '')
  let normalized = null

  // An explicitly international number must carry the Philippine +63 country code.
  if (raw.startsWith('+')) {
    if (/^639\d{9}$/.test(digits)) normalized = `+${digits}`
    else if (/^63[2-8]\d{7,9}$/.test(digits)) normalized = `+${digits}`
  } else if (/^09\d{9}$/.test(digits)) normalized = `+63${digits.slice(1)}`
  else if (/^639\d{9}$/.test(digits)) normalized = `+${digits}`
  else if (/^63[2-8]\d{7,9}$/.test(digits)) normalized = `+${digits}`
  else if (/^0[2-8]\d{7,9}$/.test(digits)) normalized = `+63${digits.slice(1)}`

  if (!normalized) throw new Error('Enter a valid Philippine mobile or landline number.')
  return normalized
}

export function validateBranchForm(form = {}) {
  const errors = {}
  const name = String(form.name ?? '').trim()
  const address = String(form.address ?? '').trim()
  const email = String(form.email ?? '').trim()
  if (!name) errors.name = 'Branch name is required.'
  else if (name.length > 180) errors.name = 'Branch name must be 180 characters or fewer.'
  if (address.length > 255) errors.address = 'Address must be 255 characters or fewer.'
  try { normalizePhilippinePhone(form.phone) } catch (error) { errors.phone = error.message }
  if (email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.email = email.length > 160 ? 'Email address must be 160 characters or fewer.' : 'Enter a valid email address.'
  }
  return errors
}
