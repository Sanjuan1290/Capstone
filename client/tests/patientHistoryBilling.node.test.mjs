import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const page = fs.readFileSync(path.join(root, 'src/pages/patientPage/History.jsx'), 'utf8')
const service = fs.readFileSync(path.join(root, 'src/services/patient.service.js'), 'utf8')

test('history keeps separate visit/billing tabs and linked patient bill details', () => {
  for (const text of ['Visit & Billing History', 'Visit History', 'Billing History', 'View Bill', 'View Bill & Payments', 'Payment History', 'printBillingReceipt', 'getMyBillingDetails']) assert.ok(page.includes(text), `missing ${text}`)
})
test('summary reports outstanding balances without guessing unavailable data', () => {
  assert.match(page, /summary\.outstanding_balance/)
  assert.match(page, /billingError \? .*'—'/)
})
test('uses patient-only endpoints for billing with credentials', () => {
  assert.match(service, /\/billing\/history/)
  assert.match(service, /credentials: 'include'/)
  assert.doesNotMatch(service, /\/billing\/history\/\$\{patientId\}/)
})
