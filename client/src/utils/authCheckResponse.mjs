// Distinguish an explicit signed-out response from an unavailable auth API.
// The current check-auth endpoints return HTTP 200 with authenticated:false for
// an invalid or missing session. Non-2xx and malformed responses are not logout.
export const authCheckOutcome = (response, data) => {
  if (!response || response.ok !== true) return 'unavailable'
  if (data?.authenticated === true && data.user && typeof data.user === 'object' && !Array.isArray(data.user)) {
    return 'authenticated'
  }
  if (data?.authenticated === false) return 'unauthenticated'
  return 'unavailable'
}
