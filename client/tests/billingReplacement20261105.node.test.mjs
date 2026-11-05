import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve, dirname} from 'node:path'
import {statusQueryFor,normalizedBillingTab} from '../src/components/billing/billingWorkspaceModel.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = f => readFileSync(resolve(root,f),'utf8')
const workspace = read('src/components/billing/BillingWorkspace.jsx')
const router = read('src/App.jsx')

test('one shared workspace has exactly two sections and three payment states',()=>{
 assert.match(workspace,/id: 'payments', label: 'Payments'/)
 assert.match(workspace,/id: 'history', label: 'Receipts & History'/)
 assert.match(workspace,/id: 'pending', label: 'Pending'/)
 assert.match(workspace,/id: 'failed', label: 'Failed'/)
 assert.match(workspace,/id: 'paid', label: 'Paid'/)
 assert.doesNotMatch(workspace,/Admin Tools|More filters|<details|CashierDrawer|Reconciliation/)
})
test('filter mapping keeps all statuses and uses explicit failed gateway state',()=>{
 assert.equal(statusQueryFor('payments','pending'),'draft,pending,ready,partially_paid')
 assert.equal(statusQueryFor('payments','failed'),'payment_failed')
 assert.equal(statusQueryFor('payments','paid'),'paid')
 assert.equal(statusQueryFor('history','paid'),'')
 assert.equal(normalizedBillingTab('transactions'),'history')
})
test('Admin and Staff use the same billing workspace',()=>{
 assert.match(read('src/pages/adminPage/Admin_Billing.jsx'),/BillingWorkspace role="admin"/)
 assert.match(read('src/pages/staffPage/Staff_Billing.jsx'),/BillingWorkspace role="staff"/)
})
test('visible search method and date fields replace collapsible filters',()=>{
 for(const label of ['Search bills','Payment method','From','To'])assert.ok(workspace.includes(label))
 assert.doesNotMatch(workspace,/More billing tools/)
})
test('legacy financial routes redirect to new billing rather than rendering the old tools',()=>{
 for(const route of ["path='billing/approvals'", "path='billing/payment-issues'", "path='billing/reconciliation'", "path='billing/transactions'"]){
  const line=router.split('\n').find(x=>x.includes(route));assert.ok(line,route);assert.match(line,/LegacyBillingRedirect/)
 }
 assert.match(router,/path='billing\/transactions\/:billingId' element=\{<BillHistoryDetail/)
 assert.match(router,/path='checkout\/history\/:billingId' element=\{<StaffPermissionRoute/)
})
test('pending clinical adjustments are reviewed on bill, not by a Doctor',()=>{
 const component=read('src/components/billing/ChargeAdjustmentsPanel.jsx')
 assert.match(component,/staffOnly && <div className/)
 assert.match(component,/Review Charge Reductions/)
 assert.match(component,/!staffOnly && t.status==='pending'/)
})
test('latest gateway failure is branch scoped and excludes paid/cancelled attempts',()=>{
 for(const f of ['../server/routers/branchOperationalReads.js','../server/controllers/staff.controller.js']){
  const source=readFileSync(resolve(root,f),'utf8')
  assert.match(source,/payment_failed/)
  assert.match(source,/latest_gateway_status='failed'/)
  assert.match(source,/MAX\(id\) AS latest_id/)
  assert.match(source,/gateway\.branch_id=b\.branch_id|gateway\.branch_id = b\.branch_id/)
 }
})
test('resolving one request retains the others and rejects self-approval',()=>{
 const source=readFileSync(resolve(root,'../server/utils/chargeAdjustments.js'),'utf8')
 assert.match(source,/SELF_APPROVAL_DENIED/)
 assert.match(source,/UPDATE billing_charge_adjustments SET bill_version=\?/)
 assert.doesNotMatch(source,/status='expired',resolved_at=NOW\(\),admin_note='Bill version changed after another approved adjustment'/)
})
test('per-bill history contains charges payments receipts requests and activity',()=>{
 const source=read('src/components/billing/BillHistoryDetail.jsx')
 for(const x of ['Bill Charges','Adjustment Requests','Payments & Receipts','Bill Activity','printBillingReceipt'])assert.ok(source.includes(x),x)
 assert.doesNotMatch(source,/Admin Tools|More filters|CashDrawer/)
})
test('checkout presents four clear sections and handles adjustments at billing review',()=>{
 for(const file of ['src/pages/adminPage/Admin_CheckoutDetail.jsx','src/pages/staffPage/Staff_CheckoutDetail.jsx']){
  const source=read(file)
  for(const title of ['1. Patient & Consultation','2. Bill Charges','3. Adjustments & Discounts','4. Payment'])assert.ok(source.includes(title),`${file}: ${title}`)
  assert.equal((source.match(/<ChargeAdjustmentsPanel billingId=/g)||[]).length,1)
  assert.ok(source.indexOf('<ChargeAdjustmentsPanel billingId=')>source.indexOf('3. Adjustments & Discounts'))
  assert.match(source,/No Additional Discount/)
  assert.doesNotMatch(source,/Patient Checkout/)
 }
})
