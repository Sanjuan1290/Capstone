const normalizeOptionalImageUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return null
  if (/^(https?:\/\/|\/)/i.test(url)) return url
  return null
}

module.exports = { normalizeOptionalImageUrl }

