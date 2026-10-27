'use strict'

// Only outbound email provider: Resend REST API (no SMTP port or SDK required).
const sendResendEmail = async ({ to, subject, html, headers, from, idempotencyKey }) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  const sender = String(from || process.env.EMAIL_FROM || '').trim()
  if (!apiKey || !sender) {
    const err = new Error('Resend email delivery is not configured.')
    err.code = 'EMAIL_NOT_CONFIGURED'
    throw err
  }
  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = String(idempotencyKey)
  // Do not retry automatically: a timeout may happen after Resend accepts the email.
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({from: sender, to: Array.isArray(to) ? to : [to], subject, html, ...(headers ? { headers } : {})}),
    signal: AbortSignal.timeout(15000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.id) {
    const err = new Error(`Resend email request failed (${response.status}).`)
    err.code = 'EMAIL_PROVIDER_FAILED'
    err.providerStatus = response.status
    throw err
  }
  return payload.id
}

module.exports = { sendResendEmail }
