import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveStaffBillingTab, staffBillingVisibleTabs, staffBillingBasePath } from '../src/utils/staffBillingAccess.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('staff with Checkout and Billing sees the same four billing tasks as Admin', () => {
  assert.deepEqual(staffBillingVisibleTabs({ checkout:true, billing:true }), ['checkout','transactions','payment-issues','cash'])
  assert.equal(resolveStaffBillingTab(null, { checkout:true, billing:true }), 'checkout')
  assert.equal(staffBillingBasePath({ checkout:true }), '/staff/checkout')
})
test('billing-only staff cannot reach payment or cashier tools via query parameter', () => {
  for (const badTab of ['checkout','payment-issues','cash','admin','']) {
    assert.equal(resolveStaffBillingTab(badTab, { checkout:false, billing:true }), 'transactions')
  }
  assert.deepEqual(staffBillingVisibleTabs({ checkout:false, billing:true }), ['transactions'])
  assert.equal(staffBillingBasePath({ checkout:false }), '/staff/billing')
})
test('checkout-only staff can still read branch-owned bills but does not gain Admin approvals', () => {
  assert.deepEqual(staffBillingVisibleTabs({ checkout:true, billing:false }), ['checkout','transactions','payment-issues','cash'])
  const hub=read('pages/staffPage/Staff_Billing.jsx')
  assert.doesNotMatch(hub, /Approve Requests|Admin_Billing|from ['"]\.\.\/\.\.\/services\/admin/)
  assert.match(hub, /getMyCashierClosing|StaffCashDrawer/)
})
test('no permission means no billing tab is available', () => {
  assert.deepEqual(staffBillingVisibleTabs({}), [])
  assert.equal(resolveStaffBillingTab('transactions',{}),null)
})
test('Staff sidebar shows one Billing item, preserves two separate permissions', () => {
  const layout=read('components/layouts/StaffLayout.jsx')
  assert.match(layout, /item\.path === '\/staff\/billing' && hasStaffPermission\(user, 'checkout'\)/)
  assert.match(layout, /permission: 'checkout', name: 'Billing', path: '\/staff\/checkout'/)
  assert.match(layout, /permission: 'billing', name: 'Billing', path: '\/staff\/billing'/)
})
test('staff routes protect checkout mutations and billing records independently', () => {
  const routes=read('App.jsx')
  assert.match(routes, /path='checkout' element=\{<StaffPermissionRoute permission="checkout"><Staff_Billing/)
  assert.match(routes, /path='checkout\/:billingId' element=\{<StaffPermissionRoute permission="checkout"><Staff_CheckoutDetail/)
  assert.match(routes, /path='billing' element=\{<StaffPermissionRoute permission="billing"><Staff_Billing/)
})
test('Staff checkout uses Staff API and keeps the same three stages as Admin', () => {
  const queue=read('pages/staffPage/StaffCheckoutQueue.jsx')
  assert.match(queue,/getBills\(\{ status: filter, search, page, limit: pageSize \}\)/)
  for(const label of ['Ready for Payment','Check Bill First','Remaining Balances','Find the patient','Check and confirm charges','Collect payment and issue receipt']) assert.ok(queue.includes(label), label)
  assert.doesNotMatch(queue, /admin\.service/)
})
test('Staff billing history allows viewing receipts without adding refund, void, or approval mutations', () => {
  const history=read('pages/staffPage/Staff_BillingRecords.jsx')
  assert.match(history, /getBillById\(id\)/)
  assert.match(history, /printBillingReceipt/)
  assert.doesNotMatch(history, /\b(refundPayment|voidPayment|approveBillingAdjustment|reopenCashier)\b/)
})
test('cash handling remains scoped to the currently signed-in Staff account', () => {
  const drawer=read('components/billing/StaffCashDrawer.jsx')
  assert.match(drawer,/getMyCashierClosing/)
  assert.match(drawer,/closeMyCashier/)
  assert.doesNotMatch(drawer,/getBillingReconciliation|reopenCashier/)
})
test('Staff QR status tab is a branch-checked read-only lookup, not a payment/refund action', () => {
  const qr=read('components/billing/StaffBillingQrLookup.jsx')
  assert.match(qr,/getBillById\(billId\)/)
  assert.match(qr,/getStaffQrStatus\(billId\)/)
  assert.match(qr,/needs_admin_review/)
  assert.doesNotMatch(qr,/createStaffQrPayment|cancelStaffQrPayment|payBill|refundPayment/)
})

test('legacy Staff Billing URL stays on bills and receipts, while Checkout URL starts at Take Payment', () => {
  const src=read('pages/staffPage/Staff_Billing.jsx')
  assert.match(src, /location\.pathname === '\/staff\/billing' \? 'transactions' : null/)
})
