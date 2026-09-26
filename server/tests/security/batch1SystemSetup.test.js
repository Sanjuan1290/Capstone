const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 26 Batch 1 — System Setup and booking cleanup', () => {
  it('shows explicit Specialty and Clinic labels during patient doctor selection', () => {
    const source = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(source).toContain('Specialty:')
    expect(source).toContain('Clinic:')
    expect(source).toContain("String(doc.specialty || '').trim() || 'Not specified'")
  })

  it('supports safe delete actions for Service Categories and Units of Measure', () => {
    const ui = read('client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx')
    const router = read('server', 'routers', 'admin.router.js')
    const controller = read('server', 'controllers', 'admin.controller.js')
    expect(ui).toContain('deleteBillingServiceCategory')
    expect(ui).toContain('deleteInventoryUom')
    expect(ui).toContain('Edit & Deactivate')
    expect(router).toContain("router.delete('/system-setup/service-categories/:id'")
    expect(router).toContain("router.delete('/system-setup/uoms/:id'")
    expect(controller).toContain("code:'SERVICE_CATEGORY_IN_USE'")
    expect(controller).toContain("code:'UOM_IN_USE'")
  })

  it('uses one UOM name and a fixed two-decimal policy', () => {
    const ui = read('client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx')
    const controller = read('server', 'controllers', 'admin.controller.js')
    const schema = read('server', 'utils', 'schema.js')
    expect(ui).not.toContain('Decimal Places *')
    expect(ui).not.toContain('Abbreviation')
    expect(ui).toContain('always use up to 2 decimal places (0.01)')
    expect(controller).toContain('const decimalPrecision = allowDecimal ? 2 : 0')
    expect(schema).toContain("dropColumnIfExists('inventory_uoms', 'abbreviation')")
  })
})
