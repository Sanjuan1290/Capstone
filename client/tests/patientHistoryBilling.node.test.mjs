import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const page = fs.readFileSync(path.join(root, 'src/pages/patientPage/History.jsx'), 'utf8')
const service = fs.readFileSync(path.join(root, 'src/services/patient.service.js'), 'utf8')

test('history keeps visit and bill details without follow-up cards, receipt printing or the linked appointment action', () => {
  for (const text of ['Visit & Billing History', 'Visit History', 'Billing History', 'View Bill', 'View Bill & Payments', 'Payment History', 'getMyBillingDetails']) assert.ok(page.includes(text), `missing ${text}`)
  assert.doesNotMatch(page, /PatientFollowupRecommendations|printBillingReceipt|View linked appointment|View \/ Print Receipt/)
})
test('summary retains paid bill counts without displaying outstanding balances', () => {
  assert.match(page, /summary\.paid_bills/)
  assert.match(page, /billResults\.summary && !billingError/)
  assert.doesNotMatch(page, /summary\.outstanding_balance|Outstanding Balance/)
})
test('uses patient-only endpoints for billing with credentials', () => {
  assert.match(service, /\/billing\/history/)
  assert.match(service, /credentials: 'include'/)
  assert.doesNotMatch(service, /\/billing\/history\/\$\{patientId\}/)
})
