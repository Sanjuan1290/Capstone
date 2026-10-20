// Cloudflare Pages Functions: same-origin proxy for the Express API on Render.
// Secrets and PayMongo webhooks stay on Render; the browser only calls /api/.
export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
  // Signed payment webhooks must target Render's HTTPS hostname directly.
  if (url.pathname === '/api/webhooks/paymongo') {
    return Response.json({ code: 'WEBHOOK_DIRECT_ONLY', message: 'Use the Render API webhook URL.' }, { status: 404 })
  }
  let upstream
  try {
    upstream = new URL(env.API_ORIGIN)
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') throw new Error('Invalid API_ORIGIN')
  } catch {
    return Response.json({ code: 'UPSTREAM_NOT_CONFIGURED', message: 'API gateway is unavailable.' }, { status: 503 })
  }
  const target = new URL(url.pathname + url.search, upstream.origin)
  const headers = new Headers(request.headers)
  // Never trust client-provided forwarding headers as origin/client authentication.
  for (const key of ['host', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'forwarded']) headers.delete(key)
  headers.set('X-Forwarded-Proto', 'https')
  try {
    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    })
    const output = new Response(response.body, response)
    output.headers.set('Cache-Control', 'no-store')
    // Do not buffer: event streams and QR payment polling must remain responsive.
    return output
  } catch {
    return Response.json({ code: 'UPSTREAM_UNAVAILABLE', message: 'The clinic API is temporarily unavailable.' }, { status: 502 })
  }
}
