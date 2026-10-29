const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')
const readClient = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', ...parts), 'utf8')

describe('multi-item stock transfer requests', () => {
  const schema = read('utils', 'schema.js')
  const transfer = read('utils', 'supplyTransfers.js')
  const doctor = read('controllers', 'doctor.controller.js')
  const verify = read('scripts', 'verifyDeployment.js')

  it('groups transfer lines under one request', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS supply_request_groups')
    expect(schema).toContain("ensureColumn('supply_requests', 'request_group_id', 'BIGINT NULL')")
    expect(schema).toContain('uniq_supply_request_group_item')
    expect(verify).toContain("supply_request_groups: ['doctor_id'")
  })

  it('accepts several unique inventory lines in one doctor request', () => {
    expect(doctor).toContain('Array.isArray(req.body?.items)')
    expect(doctor).toContain('rawItems.length > 20')
    expect(doctor).toContain('Add between 1 and 20 inventory items to the transfer request.')
    expect(doctor).toContain('DUPLICATE_TRANSFER_ITEM')
    expect(doctor).toContain('INSERT INTO supply_request_groups')
    expect(doctor).toContain('request_group_id, doctor_id, inventory_id')
  })

  it('approves every line atomically using the existing FEFO transfer engine', () => {
    expect(transfer).toContain('for (const line of lines)')
    expect(transfer).toContain('transferInventoryBatchesFEFO')
    expect(transfer).toContain('No items in this request were transferred.')
    expect(transfer).toContain('await conn.rollback()')
    expect(transfer).toContain('Stock transfer approved.')
  })

  it('retires doctor and reviewer request surfaces without deleting the historical engine', () => {
    const app = readClient('App.jsx')
    const doctorRouter = read('routers', 'doctor.router.js')
    const adminRouter = read('routers', 'admin.router.js')
    const staffRouter = read('routers', 'staff.router.js')
    expect(app).not.toContain('<Doctor_StockTransferRequest')
    expect(app).not.toContain('<Admin_SupplyRequests')
    expect(app).not.toContain('<Staff_SupplyRequests')
    expect(doctorRouter).not.toContain("router.post('/requests'")
    expect(adminRouter).not.toContain("router.patch('/supply-requests'")
    expect(staffRouter).not.toContain("router.patch('/supply-requests'")
    expect(transfer).toContain('transferInventoryBatchesFEFO') // Legacy records are immutable, not erased.
  })
})

