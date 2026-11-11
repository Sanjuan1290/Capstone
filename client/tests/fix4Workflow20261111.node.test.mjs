import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeClinicEvent } from '../src/utils/clinicLiveEvents.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = p => fs.readFileSync(path.join(root,p),'utf8')
const checkouts = ['client/src/pages/adminPage/Admin_CheckoutDetail.jsx','client/src/pages/staffPage/Staff_CheckoutDetail.jsx','client/src/components/billing/BillCheckout.jsx']

test('patient history does not send clinical notes or progress images', () => {
 const server = read('server/controllers/patient.controller.js')
 const endpoint = server.slice(server.indexOf('const getHistory = '), server.indexOf('const getMyBillingHistory = '))
 assert.doesNotMatch(endpoint, /consultation_notes|progress_images|loadImagesForConsultationIds/)
 assert.match(endpoint,/c\.prescription/)
 assert.match(endpoint,/res\.json\(rows\)/)
 const page = read('client/src/pages/patientPage/History.jsx')
 assert.doesNotMatch(page, /visit\.consultation_notes|visit\.progress_images|ProgressImages/)
 assert.match(page,/PrescriptionDetails/)
})
test('service editor and permissions have item search', () => {
 const service = read('client/src/pages/adminPage/Admin_BillingServiceForm.jsx')
 const picker = read('client/src/components/accounts/StaffPermissionPicker.jsx')
 assert.match(service,/Search inventory item/)
 assert.match(service,/inv\.barcode/)
 assert.match(picker,/Search staff permissions/)
 assert.match(picker,/filteredGroups\.map/)
 const keys=read('client/src/config/staffPermissions.js')
 assert.match(keys,/key: 'checkout', label: 'Manage Payments \(Checkout\)'/)
 assert.match(keys,/key: 'billing', label: 'View Billing Records'/)
})
test('Excel preview filters changes without changing the upload payload', () => {
 const view = read('client/src/components/system/InventoryExcelTools.jsx')
 assert.match(view,/const visibleRows =/)
 assert.match(view,/reviewStatus === 'errors'/)
 assert.match(view,/visibleRows\.slice\(0,100\)/)
 assert.match(view,/Open Services & Pricing/)
 assert.match(view,/const payload = changes\.map\(entry => entry\.payload\)/)
})
test('all checkout views put adjustments in Review Charges and Confirm Bill is read-only', () => {
 for(const p of checkouts) {
  const view=read(p)
  const first=view.indexOf('{isDraft && step === 1 && (')
  const second=view.indexOf('{isDraft && step === 2 && (')
  const payment=view.indexOf('{isPayable && step === 3 && (')
  assert.ok(first>=0 && second>first && payment>second,p)
  const review=view.slice(first,second)
  const confirm=view.slice(second,payment)
  assert.match(review, /<ChargeAdjustmentsPanel/)
  assert.match(review,/Additional Discount/)
  assert.match(review,/Request a price correction/)
  assert.match(confirm,/Confirm Bill \(Read Only\)/)
  assert.doesNotMatch(confirm,/<ChargeAdjustmentsPanel|DiscountProofField|selectDiscount\(/)
  assert.match(view,/const proceedToReview = async/)
  assert.match(view,/await saveDraft\(/)
 }
})
test('bill save creates branch-scoped SSE event and clients filter to current bill', () => {
 const server=read('server/controllers/staff.controller.js')
 const block=server.slice(server.indexOf('const updateBill ='),server.indexOf('const getBillingAdjustmentRequests ='))
 assert.match(block,/await conn\.commit\(\)/)
 assert.match(block,/broadcast\(\['admin', 'staff'\], 'billing_updated', \{ billingId \}, \{ branchId: req\.branchId \}\)/)
 assert.ok(block.indexOf('await conn.commit()') < block.indexOf("'billing_updated'"))
 assert.equal(normalizeClinicEvent('billing_updated'),'billing.updated')
 for(const p of checkouts){const s=read(p);assert.match(s,/updatedBillId|const changed=/);assert.match(s,/billing\.updated/);assert.match(s,/versionConflict/)}
})
test('Admin refunds use existing password and 6-digit email code protection, never touch stock', () => {
 const ui=read('client/src/components/billing/BillingPaymentRefundControl.jsx')
 const server=read('server/controllers/admin.controller.js')
 assert.match(ui,/refundBillingPayment\(payment\.id, \{ amount: requested, reason: reason\.trim\(\), password \}\)/)
 assert.match(ui,/confirmBillingPaymentAction\(payment\.id, code\)/)
 assert.match(ui,/moneyReturned/)
 assert.match(server,/bcrypt\.compare\(password, admin\.password\)/)
 assert.match(server,/sendAccountSecurityOtp/)
 assert.match(ui,/does not send money through PayMongo or add medicines back to stock/)
 const history=read('client/src/components/billing/BillHistoryDetail.jsx')
 assert.match(history,/!staff && <BillingPaymentRefundControl/)
})
test('confirmed unpaid bill can reopen but paid bill does not offer direct edit', () => {
 const server=read('server/controllers/staff.controller.js')
 assert.match(server,/Only a confirmed bill with no recorded payment can return to editing/)
 for(const p of checkouts){const view=read(p);assert.match(view,/canReopenForEditing/);assert.match(view,/Paid bills cannot be edited directly/)}
})

test('Admin stock usage lookup respects the current branch', () => {
 const source=read('server/controllers/billingCorrections.controller.js')
 const block=source.slice(source.indexOf('const getBillStockUsage ='),source.indexOf('const reverseCheckoutDispensing ='))
 assert.match(block,/WHERE id = \? AND branch_id = \? LIMIT 1/)
 assert.match(block,/\[billingId, req.branchId\]/)
})
