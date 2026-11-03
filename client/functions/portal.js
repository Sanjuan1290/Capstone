// Preserve the original Realty login URL after moving SYSTEM to /system.
// Use a temporary redirect to avoid a stale permanent browser cache.
export const onRequest = ({ request }) => {
  const url = new URL(request.url)
  url.pathname = '/system/portal'
  return Response.redirect(url, 302)
}
