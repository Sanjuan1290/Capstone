const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 28 Batch 2 — inventory semantics, services setup, and prescription quantity', () => {
  it('separates stock unit from per-unit strength/size in inventory', () => {
    const ui = read('client', 'src', 'pages', 'shared', 'Inventory.jsx')
    const schema = read('server', 'utils', 'schema.js')
    const admin = read('server', 'controllers', 'admin.controller.js')
    const staff = read('server', 'controllers', 'staff.controller.js')

    expect(ui).toContain('Stock Unit *')
    expect(ui).toContain('Strength / Size per Stock Unit')
    expect(ui).toContain('measurement_value')
    expect(ui).toContain('measurement_unit')
    expect(ui).toContain('This does not change the inventory quantity.')
    expect(schema).toContain("ensureColumn('inventory', 'measurement_value', 'DECIMAL(12,4) NULL')")
    expect(schema).toContain("ensureColumn('inventory', 'measurement_unit', 'VARCHAR(30) NULL')")
    expect(admin).toContain('measurement_value, measurement_unit')
    expect(staff).toContain('measurement_value, measurement_unit')
  })

  it('renames the visible setup area without changing its stable internal route', () => {
    const tabs = read('client', 'src', 'components', 'system', 'SystemSetupTabs.jsx')
    const app = read('client', 'src', 'App.jsx')
    const permissions = read('client', 'src', 'config', 'staffPermissions.js')

    expect(tabs).toContain("label: 'Services & Pricing Setup'")
    expect(tabs).toContain("suffix: '/system-setup/billing/services'")
    expect(app).toContain("path='system-setup/billing'")
    expect(permissions).toContain('Services & Pricing Setup')
  })

  it('explains consumable quantity versus its read-only stock unit', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingServiceForm.jsx')
    expect(source).toContain('Quantity Used *')
    expect(source).toContain('Stock Unit')
    expect(source).toContain('intentionally read-only here')
    expect(source).toContain('Inherited from Inventory')
  })

  it('uses prescription quantity while keeping legacy dosage readable', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    const controller = read('server', 'controllers', 'doctor.controller.js')
    const patientHistory = read('client', 'src', 'pages', 'patientPage', 'History.jsx')
    const print = read('client', 'src', 'utils', 'consultationPrint.js')

    expect(consultation).toContain('Quantity to Prescribe')
    expect(consultation).toContain('next.quantity = next.dosage')
    expect(consultation).toContain('delete next.dosage')
    expect(controller).toContain('item.quantity ?? item.dosage')
    expect(controller).toContain('Prescription quantity')
    expect(patientHistory).toContain('rx.quantity ?? rx.dosage')
    expect(print).toContain('r.quantity??r.dosage')
  })
})

