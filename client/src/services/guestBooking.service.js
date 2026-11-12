const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.message || 'The clinic could not process this request.'), { code: result.code, status: response.status, details: result.details, retryAfter: Number(result.retry_after_seconds || response.headers.get('Retry-After') || 0) })
  return result
}
export const guestRequest = (path, options) => request('/api/patient/guest/' + path, options)
export const guestPost = (path, body) => guestRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const getGuestBranches = () => request('/api/patient/branches')
