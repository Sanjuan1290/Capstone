import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (filename) => readFileSync(new URL(`../src/${filename}`, import.meta.url),'utf8')
const nav = read('components/billing/BillingNav.jsx')
const checkout = read('pages/adminPage/Admin_Checkout.jsx')
const overview = read('components/billing/BillingWorkspace.jsx')
const admin = read('components/billing/BillCheckout.jsx')
const staff = read('components/billing/BillCheckout.jsx')
const transactions = read('components/billing/BillingWorkspace.jsx')
const approvals = read('pages/adminPage/Admin_BillingApprovals.jsx')
const issues = read('pages/adminPage/Admin_PaymentIssues.jsx')
const cashday = read('pages/adminPage/Admin_BillingReconciliation.jsx')

test('top navigation has two everyday tabs with authorized advanced tools',()=>{
 for(const label of ['Payments','Receipts & History','Admin Tools'])assert.ok(nav.includes(label),label)
 for(const path of ['billing/reconciliation','billing/payment-issues','billing/approvals'])assert.ok(nav.includes(path),path)
 assert.match(nav,/canManageBilling/);assert.match(nav,/canOwnCash/);assert.match(nav,/aria-current/)
})

test('patient-facing task queue defaults to ready to collect',()=>{
  assert.match(checkout,/useState\('ready'\)/)
  assert.match(checkout,/Check Bill First/)
  assert.match(checkout,/Ready for Payment/)
  assert.match(checkout,/Remaining Balances/)
  assert.match(checkout,/Find completed bills & receipts/)
  assert.match(checkout,/Cash drawer & end-of-shift count/)
})
test('shared billing workspace defaults to completed-consultation pending payments',()=>{
 assert.match(overview,/Pending Payments/);assert.match(overview,/Failed Payments/);assert.match(overview,/Paid Payments/);assert.match(overview,/payment_view:filter/)
 assert.match(read('pages/adminPage/Admin_Billing.jsx'),/<BillingWorkspace/)
})
for(const [role,source] of [['admin',admin],['staff',staff]]){
 test(`${role} checkout clears the cash selection without saving a payment`,()=>{
   assert.match(source,/payment_method: current\.payment_method === method\.value \? '' : method\.value/)
   assert.match(source,/Clear selected payment method/)
   assert.match(source,/aria-pressed/)
   assert.match(source,/Choose a payment method\. This selection does not record payment/)
   assert.match(source,/Only enter a payment after you have received the money/)
 })
 test(`${role} checkout hides manual tender during QR verification or a pending QR`,()=>{
   assert.match(source,/qrPending \? <div role="status"/)
   assert.match(source,/!qrPending && draft\.payment_method/)
   assert.match(source,/disabled=\{paying \|\| qrPending \|\| !draft\.payment_method\}/)
   assert.match(source,/Cancel QR & Switch to Cash/)
   assert.match(source,/onPendingChange=\{\(locked\) => \{/)
 })
 test(`${role} checkout does not record a cancelled QR as cash automatically`,()=>{
   assert.match(source,/onSwitchToCash=\{async \(\) => \{/)
   assert.match(source,/await load\(\{ preserveStep: true \}\)/)
   assert.match(source,/payment_method: 'cash'/)
   assert.match(source,/onClick=\{requestPay\}/)
 })
}
test('historical transactions retain search and more filters',()=>{
  assert.match(transactions,/Receipts & History/)
  assert.match(transactions,/More filters — payment method and dates/)
  for(const v of ['paymentMethod','dateBasis','dateFrom','dateTo','status'])assert.ok(transactions.includes(v))
})
test('refund, QR reconciliation, approval and cash count actions are retained',()=>{
  assert.match(approvals,/resolveBillingAdjustmentRequest/)
  assert.match(issues,/resolveAdminQrReview/)
  assert.match(issues,/cancelAdminQrPayment/)
  assert.match(issues,/Do not accept cash|You can accept cash only/)
  assert.match(cashday,/reopenCashierClosing/)
  assert.match(cashday,/getBillingReconciliation/)
})
