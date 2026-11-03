// Legacy /portal/* URLs belong to SYSTEM, not the public WEBSITE SPA.
export const onRequest = ({ request }) => {
  const url = new URL(request.url)
  const suffix = url.pathname.slice('/portal'.length)
  url.pathname = `/system/portal${suffix}`
  return Response.redirect(url, 302)
}
