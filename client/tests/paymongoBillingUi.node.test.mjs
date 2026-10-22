import test from 'node:test'
import assert from 'node:assert/strict'
import { paymentMethodLabel } from '../src/utils/billingUi.js'

test('QR Ph payments have the correct label in billing history and printed receipts', () => {
  assert.equal(paymentMethodLabel('qrph'), 'QR Ph')
})

