const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeGoogleMapsUrl, validateBranchContact } = require('../utils/philippinePhone')

const root = path.resolve(__dirname, '../..')

test('accepts the supplied Google Maps place URL and keeps the destination', () => {
  const url = 'https://www.google.com/maps/place/carait+medical+and+dermatological+clinic/@14.3385414,121.0565824,10541m/data=!3m1!1e3!4m10!1m2!2m1!1scarait!3m6!1s0x3397d7dd46e3b0cf:0x1e83bf84b4d824b3!8m2!3d14.3385414!4d121.0781252!15sCgZjYXJhaXSSAQ5tZWRpY2FsX2NsaW5pY-ABAA!16s%2Fg%2F11jcxrks9s?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D'
  assert.equal(normalizeGoogleMapsUrl(url), new URL(url).toString())
})

test('accepts common Google Maps sharing URL formats', () => {
  assert.equal(normalizeGoogleMapsUrl('https://maps.app.goo.gl/abc123'), 'https://maps.app.goo.gl/abc123')
  assert.equal(normalizeGoogleMapsUrl('https://maps.google.com/?q=Carait+Clinic'), 'https://maps.google.com/?q=Carait+Clinic')
  assert.equal(normalizeGoogleMapsUrl('https://goo.gl/maps/abc123'), 'https://goo.gl/maps/abc123')
})

test('allows an empty optional Google Maps link', () => {
  assert.equal(normalizeGoogleMapsUrl(''), null)
  assert.equal(validateBranchContact({ address: 'Laguna', phone: '09175557640', email: 'clinic@example.com' }).google_maps_url, null)
})

test('rejects non-HTTPS, unrelated domains, malformed and overlong URLs', () => {
  for (const value of [
    'http://www.google.com/maps/place/clinic',
    'https://google.com.evil.example/maps/place/clinic',
    'https://example.com/maps/place/clinic',
    'javascript:alert(1)',
    'not a URL',
    `https://www.google.com/maps/${'a'.repeat(2050)}`,
  ]) {
    assert.throws(() => normalizeGoogleMapsUrl(value), { code: 'INVALID_BRANCH_MAPS_URL', field: 'google_maps_url', statusCode: 400 })
  }
})

test('branch create and update persist google_maps_url', () => {
  const source = fs.readFileSync(path.join(root, 'server/routers/branches.router.js'), 'utf8')
  assert.match(source, /google_maps_url,offers_medical/)
  assert.match(source, /contact\.google_maps_url/)
  assert.match(source, /SET name=\?,code=\?,address=\?,phone=\?,email=\?,google_maps_url=\?/)
  assert.match(source, /google_maps_url:body\.google_maps_url===undefined\?current\.google_maps_url:body\.google_maps_url/)
})

test('branch page exposes the Maps field, preview and directions link', () => {
  const source = fs.readFileSync(path.join(root, 'client/src/pages/superAdminPage/redesign/Branches.jsx'), 'utf8')
  assert.match(source, /Google Maps Link/)
  assert.match(source, /Test Google Maps Link/)
  assert.match(source, /Get Directions/)
  assert.match(source, /normalizeGoogleMapsUrl\(form\.google_maps_url\)/)
})
