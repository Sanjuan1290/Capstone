export const pad2 = (value) => String(value).padStart(2, '0')

export const getLocalDateOnly = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export const parseDateOnly = (value) => {
  const normalized = String(value || '').slice(0, 10)
  const [year, month, day] = normalized.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export const formatDateOnly = (value, locale = 'en-PH', options = { month: 'long', day: 'numeric', year: 'numeric' }) => {
  const date = parseDateOnly(value) || new Date(value)
  if (Number.isNaN(date.getTime())) return value || '—'
  return date.toLocaleDateString(locale, options)
}
