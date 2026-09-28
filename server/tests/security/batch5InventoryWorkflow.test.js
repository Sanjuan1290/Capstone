const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 5 inventory readiness and transfer workflow', () => {
  it('uses one shared inventory readiness engine for appointment and consultation checks', () => {
    const utility = read('server', 'utils', 'inventoryReadiness.js')
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    expect(utility).toContain('getAppointmentInventoryReadiness')
    expect(utility).toContain('getBillingInventoryReadiness')
    expect(utility).toContain("status === 'transfer_needed'")
    expect(doctor).toContain('getBillingInventoryReadiness({ billing, appointment, executor: conn })')
  })

  it('warns before appointment confirmation when expected consumables are not ready', () => {
    const admin = read('server', 'controllers', 'admin.controller.js')
    const staff = read('server', 'controllers', 'staff.controller.js')
    expect(admin).toContain('INVENTORY_READINESS_WARNING')
    expect(staff).toContain('INVENTORY_READINESS_WARNING')
    expect(admin).toContain('inventory_override_reason')
    expect(staff).toContain('inventory_override_reason')
  })

  it('links doctor stock transfers to active appointments and consultations', () => {
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    const schema = read('server', 'utils', 'schema.js')
    expect(doctor).toContain("a.status IN ('confirmed','rescheduled','in-progress')")
    expect(doctor).toContain('appointment_id, consultation_id, destination_location_id')
    expect(schema).toContain("ensureColumn('supply_request_groups', 'appointment_id'")
    expect(schema).toContain("ensureColumn('supply_request_groups', 'consultation_id'")
  })

  it('keeps transfer approval atomic and does not bill transferred quantities', () => {
    const transfers = read('server', 'utils', 'supplyTransfers.js')
    expect(transfers).toContain('await conn.beginTransaction()')
    expect(transfers).toContain('No items in this request were transferred.')
    expect(transfers).not.toContain('billing_items')
    expect(transfers).not.toContain('billing_records')
  })

  it('keeps the new consultation autosave UI and appointment-linked missing-stock action', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).not.toContain('Save Draft')
    expect(consultation).not.toContain('Draft autosaves every 25 seconds')
    expect(consultation).toContain('Request Missing Stock')
    expect(consultation).toContain('appointment_id=${appt.id}')
  })

  it('uses an aligned portal sidebar scrollbar across all portal layouts', () => {
    for (const file of ['AdminLayout.jsx','StaffLayout.jsx','DoctorLayout.jsx','PatientLayout.jsx']) {
      expect(read('client', 'src', 'components', 'layouts', file)).toContain('portal-sidebar-scroll')
    }
    expect(read('client', 'src', 'index.css')).toContain('.portal-sidebar-scroll')
  })
})
