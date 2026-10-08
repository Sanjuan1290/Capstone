const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..', '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

describe('billing checkout follow-up regressions', () => {
  it('uses clinic-facing billing statuses and provides a return path to payment', () => {
    const ui = read('client', 'src', 'utils', 'billingUi.js')
    const detail = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingTransactionDetail.jsx')
    const list = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingTransactions.jsx')
    expect(ui).toContain("draft: { label: 'Needs Review'")
    expect(ui).toContain("ready: { label: 'Ready to Collect'")
    expect(ui).toContain("partially_paid: { label: 'Balance Remaining'")
    expect(ui).toContain("paid: { label: 'Completed'")
    expect(detail).toContain("'Continue Payment' : 'Collect Payment'")
    expect(detail).toContain('/admin/billing/checkout/${bill.id}')
    expect(list).toContain("'Continue Payment' : 'Collect Payment'")
    const checkout = read('client', 'src', 'pages', 'adminPage', 'Admin_CheckoutDetail.jsx')
    expect(checkout).toContain("setStep(['ready', 'partially_paid'].includes(current.status) ? 3")
  })

  it('lets a confirmed bill return to editing only before any payment history exists', () => {
    const controller = read('server', 'controllers', 'staff.controller.js')
    const staffRouter = read('server', 'routers', 'staff.router.js')
    const adminRouter = read('server', 'routers', 'admin.router.js')
    const staffService = read('client', 'src', 'services', 'staff.service.js')
    const adminService = read('client', 'src', 'services', 'admin.service.js')
    const adminCheckout = read('client', 'src', 'pages', 'adminPage', 'Admin_CheckoutDetail.jsx')
    const staffCheckout = read('client', 'src', 'pages', 'staffPage', 'Staff_CheckoutDetail.jsx')

    expect(controller).toContain('const reopenBillForEditing = async')
    expect(controller).toContain("locked.status !== 'ready'")
    expect(controller).toContain('SELECT COUNT(*) AS count FROM billing_payments WHERE billing_id = ?')
    expect(controller).toContain('SELECT COUNT(*) AS count FROM billing_item_batch_usage WHERE billing_id = ?')
    expect(controller).toContain("SET status='draft'")
    expect(controller).toContain("action: 'billing.reopened_for_editing'")

    expect(staffRouter).toContain("router.post('/billing/:id/reopen'")
    expect(adminRouter).toContain("router.post('/billing/:id/reopen'")
    expect(adminRouter).toContain("router.post('/billing/:id/reopen-for-editing', ...auth, staffCtrl.reopenBillForEditing)")
    expect(staffService).toContain('export const reopenBillForEditing')
    expect(adminService).toContain('export const reopenAdminCheckoutBill')
    expect(adminService).toContain('/billing/${id}/reopen-for-editing')
    // Preserve the original reason-required Admin correction flow; checkout-only
    // reopening must not silently bypass its stock return and audit behavior.
    expect(adminRouter).toContain("router.post('/billing/:id/reopen', ...auth, correctionsCtrl.reopenBill)")

    for (const source of [adminCheckout, staffCheckout]) {
      expect(source).toContain('Found a billing mistake before payment?')
      expect(source).toContain("reopening ? 'Reopening…' : 'Edit Bill'")
      expect(source).toContain('setStep(2)')
      expect(source).toContain('(bill?.payments?.length || 0) === 0')
    }
  })

  it('keeps consultation extras protected and removes the old stock explanation banner', () => {
    const admin = read('client', 'src', 'pages', 'adminPage', 'Admin_CheckoutDetail.jsx')
    const staff = read('client', 'src', 'pages', 'staffPage', 'Staff_CheckoutDetail.jsx')
    const controller = read('server', 'controllers', 'staff.controller.js')
    for (const source of [admin, staff]) {
      expect(source).toContain("['consultation', 'consultation_extra']")
      expect(source).toContain("item.source_type === 'consultation_extra'")
      expect(source).not.toContain('Service consumables recorded by the Doctor are already deducted when the consultation is completed.')
      expect(source).toContain('Save Review')
    }
    expect(controller).toContain("['consultation', 'consultation_extra'].includes(item.source_type)")
    expect(controller).toContain("row.source_type === 'staff_supply'")
    expect(controller).toContain("item.source_type === 'staff_supply'")
  })

  it('uses Additional Quantity Used wording for extra consumables', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).toContain('Additional Quantity Used')
    expect(consultation).not.toContain('Actual Quantity Used')
  })

  it('uses image proof for discounts while keeping payment transaction references as text', () => {
    const adminCheckout = read('client', 'src', 'pages', 'adminPage', 'Admin_CheckoutDetail.jsx')
    const staffCheckout = read('client', 'src', 'pages', 'staffPage', 'Staff_CheckoutDetail.jsx')
    const routesAdmin = read('server', 'routers', 'admin.router.js')
    const routesStaff = read('server', 'routers', 'staff.router.js')
    const schema = read('server', 'utils', 'schema.js')
    expect(adminCheckout).toContain('DiscountProofField')
    expect(staffCheckout).toContain('reference_image_url: discountProof.url')
    expect(staffCheckout).toContain('Reference Number *')
    expect(routesAdmin).toContain("/billing/discount-proof/upload")
    expect(routesStaff).toContain("/billing/discount-proof/upload")
    expect(schema).toContain("discount_reference_image_url")
    expect(schema).toContain("reference_image_url")
  })
})

