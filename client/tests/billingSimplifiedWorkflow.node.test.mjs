import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (filename) => readFileSync(new URL(`../src/${filename}`, import.meta.url),'utf8')
const nav = read('components/billing/AdminBillingNav.jsx')
const checkout = read('pages/adminPage/Admin_Checkout.jsx')
const overview = read('pages/adminPage/Admin_Billing.jsx')
const admin = read('pages/adminPage/Admin_CheckoutDetail.jsx')
const staff = read('pages/staffPage/Staff_CheckoutDetail.jsx')
const transactions = read('pages/adminPage/Admin_BillingTransactions.jsx')
const approvals = read('pages/adminPage/Admin_BillingApprovals.jsx')
const issues = read('pages/adminPage/Admin_PaymentIssues.jsx')
const cashday = read('pages/adminPage/Admin_BillingReconciliation.jsx')

test('top navigation gives four everyday tasks and retains existing routes', () => {
  const labels = ['Take Payment','Bills & Receipts','Payment Problems','End-of-Day Cash']
  for(const label of labels) assert.ok(nav.includes(label), label)
  for(const url of ['/admin/billing?tab=checkout','/admin/billing/transactions','/admin/billing/payment-issues','/admin/billing/reconciliation','/admin/billing/approvals','/admin/billing?tab=overview']) assert.ok(nav.includes(url), url)
  assert.match(nav,/More billing tools/)
  assert.match(nav,/aria-current/)
})
test('patient-facing task queue defaults to ready to collect',()=>{
  assert.match(checkout,/useState\('ready'\)/)
  assert.match(checkout,/Check Bill First/)
  assert.match(checkout,/Ready for Payment/)
  assert.match(checkout,/Remaining Balances/)
  assert.match(checkout,/Find completed bills & receipts/)
  assert.match(checkout,/Cash drawer & end-of-shift count/)
})
test('billing summary is retained while primary checkout instructions are simplified',()=>{
  assert.match(overview,/tab.*overview/)
  assert.match(overview,/Admin_Checkout embedded/)
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
  assert.match(transactions,/Bills & Receipts/)
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
