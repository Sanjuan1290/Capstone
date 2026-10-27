// Cloudflare Pages Functions: same-origin proxy for the Express API on Render.
// Secrets and PayMongo webhooks stay on Render; the browser only calls /api/.
export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
  // Signed payment webhooks must target Render's HTTPS hostname directly.
  let decodedPath
  try { decodedPath = decodeURIComponent(url.pathname) }
  catch { return Response.json({ code: 'INVALID_API_PATH' }, { status: 400 }) }
  if (/^\/api\/webhooks\/paymongo\/?$/i.test(decodedPath)) {
    return Response.json({ code: 'WEBHOOK_DIRECT_ONLY', message: 'Use the Render API webhook URL.' }, { status: 404 })
  }
  let upstream
  try {
    upstream = new URL(env.API_ORIGIN)
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') throw new Error('Invalid API_ORIGIN')
  } catch {
    return Response.json({ code: 'UPSTREAM_NOT_CONFIGURED', message: 'API gateway is unavailable.' }, { status: 503 })
  }
  const proxySecret = String(env.API_PROXY_SECRET || '')
  const clientIp = String(request.headers.get('cf-connecting-ip') || '').trim()
  if (proxySecret.length < 32 || !clientIp) {
    return Response.json({ code: 'PROXY_NOT_CONFIGURED', message: 'API gateway is unavailable.' }, { status: 503 })
  }
  const target = new URL(url.pathname + url.search, upstream.origin)
  const headers = new Headers(request.headers)
  // Only this Pages Function may assert the edge-observed client IP to Render.
  // Strip user-supplied proxy metadata and any stale signed headers first.
  for (const key of [
    'host', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'forwarded',
    'x-real-ip', 'cf-connecting-ip', 'x-carait-client-ip', 'x-carait-proxy-time', 'x-carait-proxy-signature',
  ]) headers.delete(key)
  const proxyTime = String(Math.floor(Date.now() / 1000))
  const signedMessage = `${proxyTime}\n${clientIp}\n${request.method.toUpperCase()}\n${url.pathname}${url.search}`
  let signature
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(proxySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedMessage))
    signature = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return Response.json({ code: 'PROXY_NOT_CONFIGURED', message: 'API gateway is unavailable.' }, { status: 503 })
  }
  headers.set('X-Carait-Client-IP', clientIp)
  headers.set('X-Carait-Proxy-Time', proxyTime)
  headers.set('X-Carait-Proxy-Signature', signature)

  const controller = new AbortController()
  const abortFromClient = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abortFromClient, { once: true })
  if (request.signal.aborted) abortFromClient()
  // Render Free instances may need about a minute to wake from idle. Keep a
  // finite bound with margin so those first requests can finish without
  // allowing an upstream request to hang indefinitely.
  const timeout = setTimeout(() => controller.abort(new Error('API upstream timeout')), 90_000)
  try {
    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      signal: controller.signal,
    })
    const output = new Response(response.body, response)
    output.headers.set('Cache-Control', 'no-store')
    // Do not buffer: event streams and QR payment polling must remain responsive.
    return output
  } catch {
    if (!request.signal.aborted && controller.signal.aborted) {
      return Response.json({ code: 'UPSTREAM_TIMEOUT', message: 'The clinic API did not respond in time.' }, { status: 504 })
    }
    return Response.json({ code: 'UPSTREAM_UNAVAILABLE', message: 'The clinic API is temporarily unavailable.' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abortFromClient)
  }
}
