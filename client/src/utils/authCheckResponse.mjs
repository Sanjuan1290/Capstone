// Distinguish an explicit unauthenticated response from an unavailable auth API.
// A timeout, 5xx, malformed payload, or proxy error must not be treated as logout.
export const authCheckOutcome = (response, data) => {
  if (!response || response.ok !== true) return 'unavailable'
  if (data?.authenticated === true && data.user && typeof data.user === 'object' && !Array.isArray(data.user)) {
    return 'authenticated'
  }
  if (data?.authenticated === false) return 'unauthenticated'
  return 'unavailable'
}
