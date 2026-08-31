const SOURCE_ROUTE_MAP = [
  [/\/src\/pages\/shared\/PrivacyPolicy(?:\.jsx)?$/i, '/privacy-policy'],
  [/\/PrivacyPolicy(?:\.jsx)?$/i, '/privacy-policy'],
]

export const normalizeAppPath = (value, fallback = '/') => {
  if (!value || typeof value !== 'string') return fallback

  const trimmed = value.trim()
  if (!trimmed) return fallback

  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('#')) return trimmed

  const normalized = trimmed.replace(/\\/g, '/')
  for (const [pattern, route] of SOURCE_ROUTE_MAP) {
    if (pattern.test(normalized)) return route
  }

  if (normalized.startsWith('/')) return normalized
  return `/${normalized}`
}

export const isExternalPath = (value = '') => /^(https?:|mailto:|tel:)/i.test(value)
