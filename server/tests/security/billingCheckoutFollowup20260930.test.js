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
