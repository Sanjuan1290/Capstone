const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 26 Batch 1 — System Setup and booking cleanup', () => {
  it('shows the authoritative Clinic Assignment during patient doctor selection', () => {
    const source = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(source).toContain('Clinic Assignment:')
    expect(source).toContain('doctorClinicLabel(doc)')
    expect(source).not.toContain('Specialty:')
  })

  it('keeps safe Service Category deletion while Units of Measure stay removed from System Setup', () => {
    const ui = read('client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx')
    const router = read('server', 'routers', 'admin.router.js')
    const controller = read('server', 'controllers', 'admin.controller.js')

    expect(ui).toContain('deleteBillingServiceCategory')
    expect(ui).toContain('Edit & Deactivate')
    expect(router).toContain("router.delete('/system-setup/service-categories/:id'")
    expect(controller).toContain("code:'SERVICE_CATEGORY_IN_USE'")

    // Current product rule: Inventory uses generic unit/units and UOM is no longer
    // authored from System Setup. Legacy backend compatibility may remain.
    expect(ui).not.toContain('deleteInventoryUom')
    expect(ui).not.toContain('saveInventoryUom')
    expect(ui).not.toContain('Units of Measure')
  })

  it('does not expose legacy UOM authoring controls', () => {
    const ui = read('client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx')

    expect(ui).not.toContain('Decimal Places *')
    expect(ui).not.toContain('Abbreviation')
    expect(ui).not.toContain('Allow Decimal Quantity')
    expect(ui).not.toContain('always use up to 2 decimal places (0.01)')
  })
})
