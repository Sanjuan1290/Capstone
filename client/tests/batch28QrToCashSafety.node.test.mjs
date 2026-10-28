import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/components/billing/QrPhPaymentPanel.jsx', import.meta.url), 'utf8')
test('cash remains blocked while a PayMongo attempt retains its active bill lock', () => {
  assert.match(source, /attempt\?\.can_collect_alternate === false/)
  assert.match(source, /onPendingChange\?\.\(alternatePaymentBlocked\)/)
})
test('switch to cash requests verified cancellation; no direct forced unlocking', () => {
  assert.match(source, /Cancel QR to switch to cash/)
  assert.match(source, /await cancelQr\(billId,attempt\.id\)/)
  assert.match(source, /if \(result\?\.status !== 'cancelled'\)/)
  assert.match(source, /contact an administrator for verified reconciliation/)
})
