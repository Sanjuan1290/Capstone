// Read-only Semaphore balance check for Super Admin System Setup.
// Never return or log the Semaphore API key. The provider allows only two
// account lookups a minute, so use one cached lookup across requests.
const https = require('https')
const CACHE_MS = 90_000
const MIN_REFRESH_MS = 35_000
let cached = null
let inFlight = null

const providerAccountLookup = (apiKey) => new Promise((resolve, reject) => {
  const request = https.request({
    hostname: 'api.semaphore.co',
    path: `/api/v4/account?apikey=${encodeURIComponent(apiKey)}`,
    method: 'GET',
    headers: { Accept: 'application/json' },
  }, (response) => {
    let raw = ''
    response.on('data', chunk => {
      raw += chunk
      if (raw.length > 32768) request.destroy(new Error('Provider response too large'))
    })
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error('Semaphore could not provide an account balance.'))
        return
      }
      try { resolve(JSON.parse(raw)) }
      catch { reject(new Error('Semaphore sent an invalid balance response.')) }
    })
  })
  request.setTimeout(8000, () => request.destroy(new Error('Semaphore balance request timed out.')))
  request.on('error', () => reject(new Error('Semaphore balance is temporarily unavailable.')))
  request.end()
})

const getSemaphoreBalance = async ({ refresh = false, now = Date.now(), lookup = providerAccountLookup } = {}) => {
  const apiKey = String(process.env.SEMAPHORE_API_KEY || '').trim()
  if (!apiKey) {
    const error = new Error('Semaphore is not configured. Add SEMAPHORE_API_KEY to the server environment.')
    error.statusCode = 503
    throw error
  }
  const age = cached ? now - cached.checkedMs : Infinity
  if (cached && age >= 0 && (age < CACHE_MS && !refresh || age < MIN_REFRESH_MS)) {
    return { credit_balance: cached.balance, checked_at: cached.checkedAt, cached: true }
  }
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const account = await lookup(apiKey)
      const balance = Number(account?.credit_balance)
      if (account?.credit_balance == null) throw new Error('Semaphore did not provide a balance.')
      if (!Number.isFinite(balance) || balance < 0) throw new Error('Semaphore returned an invalid credit balance.')
      const checkedAt = new Date(now).toISOString()
      cached = { balance, checkedAt, checkedMs: now }
      return { credit_balance: balance, checked_at: checkedAt, cached: false }
    } catch (err) {
      if (cached) {
        return { credit_balance: cached.balance, checked_at: cached.checkedAt, cached: true, stale: true }
      }
      const error = new Error('Cannot load SMS credits right now. Open Semaphore to check your balance.')
      error.statusCode = 502
      throw error
    } finally { inFlight = null }
  })()
  return inFlight
}

module.exports = { getSemaphoreBalance, providerAccountLookup, CACHE_MS, MIN_REFRESH_MS }
