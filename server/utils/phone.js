const normalizePhilippinePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return null

  if (/^639\d{9}$/.test(digits)) return digits
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`
  if (/^9\d{9}$/.test(digits)) return `63${digits}`

  return null
}

const isValidPhilippinePhone = (value) => Boolean(normalizePhilippinePhone(value))

const formatPhilippinePhone = (value = '') => {
  const normalized = normalizePhilippinePhone(value)
  if (!normalized) return value

  const local = `0${normalized.slice(2)}`
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

module.exports = {
  normalizePhilippinePhone,
  isValidPhilippinePhone,
  formatPhilippinePhone,
}
