import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../src/components/billing/QrPhPaymentPanel.jsx', import.meta.url), 'utf8')
test('cash remains blocked while a PayMongo attempt retains its active bill lock', () => {
  assert.match(source, /attempt\?\.can_collect_alternate === false/)
  assert.match(source, /onPendingChange\?\.\(alternatePaymentBlocked\)/)
})
test('switching to cash requires both verified cancellation and alternate-payment permission',()=>{
 assert.match(source,/await cancelQr\(billId,attempt\.id\)/)
 assert.match(source,/result\?\.status === 'cancelled' && result\?\.can_collect_alternate === true/)
 assert.match(source,/onSwitchToCash\?\.\(\)/)
 assert.doesNotMatch(source,/setQrPending\(false\)/)
 assert.match(source,/Cash remains locked/)
})
