const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 5 deferred inventory deduction workflow', () => {
  it('keeps inventory readiness available for optional/manual stock-transfer workflows only', () => {
    const utility = read('server', 'utils', 'inventoryReadiness.js')
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    expect(utility).toContain('getAppointmentInventoryReadiness')
    expect(utility).toContain('getBillingInventoryReadiness')
    expect(utility).toContain("status === 'transfer_needed'")
    expect(doctor).not.toContain('validateClinicalInventoryAvailability')
    expect(doctor).not.toContain('getBillingInventoryReadiness({ billing, appointment, executor: conn })')
  })

  it('confirms appointments without inventory readiness warnings, overrides, or reservation UI', () => {
    const admin = read('server', 'controllers', 'admin.controller.js')
    const staff = read('server', 'controllers', 'staff.controller.js')
    const appointments = read('client', 'src', 'pages', 'shared', 'Appointments.jsx')
    expect(admin).not.toContain('INVENTORY_READINESS_WARNING')
    expect(staff).not.toContain('INVENTORY_READINESS_WARNING')
    expect(admin).not.toContain('inventory_override_reason')
    expect(staff).not.toContain('inventory_override_reason')
    expect(admin).not.toContain('inventory_preparation_needed')
    expect(staff).not.toContain('inventory_preparation_needed')
    expect(appointments).not.toContain('Inventory Readiness Check')
    expect(appointments).not.toContain('Confirm & Flag for Transfer')
    expect(appointments).not.toContain('getAppointmentInventoryReadiness(appointment.id)')
  })

  it('deducts clinical usage on finalization from the assigned Stock Room, with a safe Main Stockroom fallback', () => {
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    const draftStart = doctor.indexOf('const saveConsultationDraft')
    const finalizeStart = doctor.indexOf('const finalizeConsultation')
    const getStart = doctor.indexOf('const getConsultation', finalizeStart)
    const draftBlock = doctor.slice(draftStart, finalizeStart)
    const finalizeBlock = doctor.slice(finalizeStart, getStart)
    expect(draftBlock).not.toContain('consumeClinicalInventory')
    expect(finalizeBlock).toContain('consumeClinicalInventory')
    // Prefer the item's active physical room in its own branch; use the branch's
    // Main Stockroom only when there is no assigned room or a fallback is needed.
    expect(doctor).toContain('default_location_id FROM inventory WHERE id = ? AND branch_id=?')
    expect(doctor).toContain('inventory_locations WHERE id=? AND branch_id=? AND is_active=1 LIMIT 1')
    expect(doctor).toContain("code:'ITEM_STOCK_ROOM_UNAVAILABLE'")
    expect(doctor).toContain('const preferredLocation = assignedRoom?.name || mainStockroom.name')
    expect(doctor).toContain('fallbackLocation: assignedRoom && Number(assignedRoom.id)!==Number(mainStockroom.id) ? mainStockroom.name : null')
    expect(doctor).toContain("UPDATE appointments SET status = 'completed'")
  })

  it('does not cap actual consumable entry to pre-checked treatment-room stock', () => {
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    expect(consultation).not.toContain('clinicalDeductionPlan')
    expect(consultation).not.toContain('inventoryBlocker')
    expect(consultation).not.toContain('max={roomStock}')
    expect(consultation).toContain('No inventory is reserved when an appointment is confirmed.')
    expect(consultation).toContain('Actual recorded medicines and consumables are stocked out only when you complete the consultation.')
  })

  it('keeps reschedule time slots inside a vertically scrollable modal', () => {
    const appointments = read('client', 'src', 'pages', 'shared', 'Appointments.jsx')
    expect(appointments).toContain('max-h-[92vh]')
    expect(appointments).toContain('overflow-y-auto overscroll-contain')
    expect(appointments).toContain('shrink-0 border-t border-slate-100 bg-white')
  })

  it('retires doctor transfer-request API routes while keeping inventory history', () => {
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    const schema = read('server', 'utils', 'schema.js')
    const routes = read('server', 'routers', 'doctor.router.js')
    expect(routes).not.toContain("router.post('/requests'")
    expect(routes).not.toContain("router.get('/requests'")
    expect(doctor).toContain('consumeClinicalInventory')
    expect(schema).toContain('supply_request_groups') // Historical tables are retained.
  })

  it('keeps transfer approval atomic and does not bill transferred quantities', () => {
    const transfers = read('server', 'utils', 'supplyTransfers.js')
    expect(transfers).toContain('await conn.beginTransaction()')
    expect(transfers).toContain('No items in this request were transferred.')
    expect(transfers).not.toContain('billing_items')
    expect(transfers).not.toContain('billing_records')
  })
})


