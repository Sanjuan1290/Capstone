import test from 'node:test'
import assert from 'node:assert/strict'
import { branchDirectionsUrl, normalizeGoogleMapsUrl } from '../src/utils/philippinePhone.js'

test('patient directions preserve the exact branch pin instead of replacing it with an address search', () => {
  const pin='https://www.google.com/maps/place/Carait+Clinic/@14.3385414,121.0781252,17z'
  assert.equal(branchDirectionsUrl({google_maps_url:pin,address:'Different approximate address'}),pin)
  assert.equal(branchDirectionsUrl({google_maps_url:'https://maps.app.goo.gl/abc123'}),'https://maps.app.goo.gl/abc123')
})
test('legacy null and invalid saved links use safe address search without generating an iframe', () => {
  const expected='https://www.google.com/maps/search/?api=1&query=A%20%26%20B%20Street'
  assert.equal(branchDirectionsUrl({google_maps_url:null,address:'A & B Street'}),expected)
  assert.equal(branchDirectionsUrl({google_maps_url:'javascript:alert(1)',address:'A & B Street'}),expected)
  assert.equal(branchDirectionsUrl({google_maps_url:null,address:null}),null)
})
test('Google URLs outside Maps and incomplete sharing links are rejected', () => {
  for(const link of ['https://google.com/mapsevil','https://www.google.com/maps.evil','https://goo.gl/mapsevil/abc','https://goo.gl/maps','https://maps.app.goo.gl/','https://google.com:8443/maps','https://user:password@google.com/maps'])assert.throws(()=>normalizeGoogleMapsUrl(link))
})
