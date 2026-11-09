import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/services/portal.service.js', import.meta.url), 'utf8')
  .replace("'./cloudinaryScan'", JSON.stringify(new URL('../src/services/cloudinaryScan.js', import.meta.url).href))
const { getNotificationDestination } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('notification destinations use each authenticated portal API and return the server path', async (t) => {
  const calls = []
  const destination = { path: '/superadmin/branches/3/billing/checkout/6' }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify(destination), { headers: { 'content-type': 'application/json' } })
  })

  for (const role of ['admin', 'superadmin', 'staff', 'doctor', 'patient']) {
    assert.deepEqual(await getNotificationDestination(role, 4), destination)
  }

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/branches/my/notifications/4/destination',
    '/api/admin/notifications/4/destination',
    '/api/staff/notifications/4/destination',
    '/api/doctor/notifications/4/destination',
    '/api/patient/notifications/4/destination',
  ])
  for (const [index, { options }] of calls.entries()) {
    assert.equal(options.credentials, 'include')
    assert.equal(options.method || 'GET', 'GET')
    assert.equal(options.headers['X-Admin-Portal'], index === 1 ? 'superadmin' : undefined)
  }
})

test('unavailable notification destinations preserve the server error for the bell', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    message: 'This record was deleted or is no longer available.',
  }), { status: 410, headers: { 'content-type': 'application/json' } }))

  await assert.rejects(() => getNotificationDestination('admin', 4), {
    message: 'This record was deleted or is no longer available.',
  })
})
