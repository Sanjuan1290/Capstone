import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '../src/services/admin.service.js'), 'utf8')

const loadStandalone = async () => {
  // Remove ONLY the two unrelated imports to test these service exports in isolation.
  // The production file retains its actual imports.
  const standalone = source.replace(/^import \{ makeSecurityScanError, waitForSecurityScan \} from '\.\/cloudinaryScan'\s*$/m, '')
    .replace(/^import \{ uploadDiscountProofViaApi \} from '\.\/discountProofUpload'\s*$/m, '')
  return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(standalone))
}

test('the booking-policy editor imports are actually exported by admin.service.js', async () => {
  const mod = await loadStandalone()
  for (const key of ['getBookingPolicyContent', 'updateBookingPolicyContent', 'getBookingPolicy', 'updateBookingPolicy']) {
    assert.equal(typeof mod[key], 'function', `${key} must be a real named export`)
  }
})

test('getBookingPolicyContent uses existing admin API and includes credentials', async () => {
  const mod = await loadStandalone()
  const previous = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ title: 'Policy' }) }
  }
  try {
    const policy = await mod.getBookingPolicyContent()
    assert.deepEqual(policy, {title:'Policy'})
    assert.equal(requests[0].url, '/api/admin/system-setup/booking-policy/content')
    assert.equal(requests[0].options.credentials, 'include')
  } finally { globalThis.fetch = previous }
})

test('updateBookingPolicyContent writes to the correct endpoint with JSON payload', async () => {
  const mod = await loadStandalone()
  const previous = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ saved: true }) }
  }
  try {
    const payload = { action:'save_draft', title:'Appointment Booking Policy' }
    assert.deepEqual(await mod.updateBookingPolicyContent(payload), {saved:true})
    assert.equal(requests[0].url, '/api/admin/system-setup/booking-policy/content')
    assert.equal(requests[0].options.method, 'PUT')
    assert.equal(requests[0].options.headers['Content-Type'], 'application/json')
    assert.equal(requests[0].options.body, JSON.stringify(payload))
  } finally { globalThis.fetch = previous }
})

test('booking-policy exports remain beside existing inventory service exports', () => {
  assert.match(source, /export const getBookingPolicyContent\s*=/)
  assert.match(source, /export const updateBookingPolicyContent\s*=/)
  assert.match(source, /export const bulkUpdateInventoryItems\s*=/)
})
