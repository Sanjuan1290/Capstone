import test from 'node:test'
import assert from 'node:assert/strict'
import { getMaxWalkInBirthdate, validateWalkInBirthdate, validatePatientBirthdate } from '../src/utils/patientBirthdate.mjs'
import { calculateBalancePaymentPreview } from '../src/utils/paymentPreview.mjs'

test('walk-in calendar stops at yesterday in Manila, including month and leap-day boundaries', () => {
  assert.equal(getMaxWalkInBirthdate(new Date('2026-11-11T16:30:00Z')), '2026-11-11')
  assert.equal(getMaxWalkInBirthdate(new Date('2026-12-31T16:30:00Z')), '2026-12-31')
  assert.equal(getMaxWalkInBirthdate(new Date('2028-02-29T16:30:00Z')), '2028-02-29')
  const now = new Date('2026-11-11T16:30:00Z')
  assert.equal(validateWalkInBirthdate('2026-11-11', now), '')
  assert.equal(validateWalkInBirthdate('1900-01-01', now), '')
  assert.match(validateWalkInBirthdate('2026-11-12', now), /before today/)
  assert.match(validateWalkInBirthdate('', now), /required/)
  assert.match(validateWalkInBirthdate('2026-02-30', now), /valid/)
  assert.match(validatePatientBirthdate('2026-11-11', now), /18 years/)
})

test('checkout settles the saved remaining balance and computes change independently of a stale payment draft', () => {
  const bill = Object.freeze({ total_amount: 500, paid_amount: 200, balance_amount: 300 })
  const draft = Object.freeze({ payment_method: 'cash', payment_amount: 50, amount_received: '500.00' })
  assert.deepEqual(calculateBalancePaymentPreview({ bill, draft }), { valid: true, amount: 300, isCash: true, cashReceived: 500, change: 200, balanceAfter: 0 })
  assert.equal(bill.paid_amount, 200); assert.equal(draft.payment_amount, 50)
  assert.equal(calculateBalancePaymentPreview({ bill, draft: { ...draft, amount_received: 299 } }).valid, false)
  assert.equal(calculateBalancePaymentPreview({ bill: { balance_amount: 0 }, draft }).valid, false)
})

test('non-cash settlement uses centavo precision without creating cash change', () => {
  const preview = calculateBalancePaymentPreview({ bill: { balance_amount: '300.15' }, draft: { payment_method: 'gcash', payment_amount: 1, amount_received: 500 } })
  assert.equal(preview.amount, 300.15); assert.equal(preview.change, null); assert.equal(preview.balanceAfter, 0)
})
