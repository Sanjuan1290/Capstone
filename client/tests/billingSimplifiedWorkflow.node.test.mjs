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

test('daily Billing entry uses a two-tab shared workspace instead of legacy navigation',()=>{
  const workspace=read('components/billing/BillingWorkspace.jsx')
  assert.match(overview,/BillingWorkspace role="admin"/)
  assert.match(workspace,/label: 'Payments'/)
  assert.match(workspace,/label: 'Receipts & History'/)
  assert.doesNotMatch(workspace,/Admin Tools|More billing tools|Cash drawer|<details/)
})
test('payment status filters are Pending, Failed and Paid',()=>{
 const workspace=read('components/billing/BillingWorkspace.jsx')
 for(const status of ['Pending','Failed','Paid']) assert.match(workspace,new RegExp(`label: '${status}'`))
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
test('history and payments have visible filters instead of legacy accordion',()=>{
 const workspace=read('components/billing/BillingWorkspace.jsx')
 for(const label of ['Search bills','Payment method','From','To']) assert.ok(workspace.includes(label),label)
 assert.doesNotMatch(workspace,/More filters — payment method and dates|<details/)
 const routes=read('App.jsx')
 assert.match(routes,/LegacyBillingRedirect/)
 assert.match(routes,/BillHistoryDetail/)
})
test('refund, QR reconciliation, approval and cash count actions are retained',()=>{
  assert.match(approvals,/resolveBillingAdjustmentRequest/)
  assert.match(issues,/resolveAdminQrReview/)
  assert.match(issues,/cancelAdminQrPayment/)
  assert.match(issues,/Do not accept cash|You can accept cash only/)
  assert.match(cashday,/reopenCashierClosing/)
  assert.match(cashday,/getBillingReconciliation/)
})

