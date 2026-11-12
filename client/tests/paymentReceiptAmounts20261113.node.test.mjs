import test from 'node:test'
import assert from 'node:assert/strict'
import { paymentReceiptAmounts } from '../src/utils/paymentReceiptAmounts.mjs'

test('each cash receipt uses its own saved payment instead of bill aggregates', () => {
  assert.deepEqual(paymentReceiptAmounts({ payment_method: 'cash', amount: '1949.00', amount_received: '2000.00', change_amount: '51.00' }), [
    { label: 'Amount Paid', amount: 1949 }, { label: 'Cash Received', amount: 2000 }, { label: 'Change', amount: 51 },
  ])
  assert.deepEqual(paymentReceiptAmounts({ payment_method: 'cash', amount: 100, amount_received: 100, change_amount: 0 }).at(-1), { label: 'Change', amount: 0 })
})

test('cash values missing from historical payments remain unknown', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', -1]) {
    const rows = paymentReceiptAmounts({ payment_method: 'cash', amount: 100, amount_received: value, change_amount: value })
    assert.equal(rows[1].amount, null)
    assert.equal(rows[2].amount, null)
  }
})

test('online methods never show cash tender or change', () => {
  for (const payment_method of ['qrph', 'gcash', 'maya', 'bank_transfer']) {
    assert.deepEqual(paymentReceiptAmounts({ payment_method, amount: 100, amount_received: 200, change_amount: 100 }), [{ label: 'Amount Paid', amount: 100 }])
  }
})

test('voided payment amounts are identified instead of described as paid', () => {
  assert.equal(paymentReceiptAmounts({ payment_method: 'qrph', amount: 100, status: 'voided' })[0].label, 'Voided Amount')
})
