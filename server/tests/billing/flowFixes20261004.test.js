const fs = require('fs')
const path = require('path')
const { makeReceiptNumber, formatSequentialReceiptNumber, allocateReceiptNumber } = require('../../utils/payments')
const { summarizeLedgerRows } = require('../../utils/reportMetrics')
const { normalizeBillingItems } = require('../../utils/billing')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('2026-10-04 billing and inventory flow fixes', () => {
  it('dates receipts in clinic time, not UTC', () => {
    // 2026-10-03 23:30 UTC is 2026-10-04 07:30 in Manila.
    const lateUtc = new Date('2026-10-03T23:30:00.000Z')
    expect(makeReceiptNumber(7, lateUtc, 'abcdef')).toBe('OR-20261004-7-ABCDEF')
    expect(formatSequentialReceiptNumber(42, lateUtc)).toBe('OR-20261004-000042')
  })

  it('allocates receipt numbers from one locked counter', async () => {
    const calls = []
    const executor = { query: async (sql) => { calls.push(sql); return sql.startsWith('UPDATE') ? [{ insertId: 15 }] : [{}] } }
    const result = await allocateReceiptNumber(executor, new Date('2026-10-04T02:00:00.000Z'))
    expect(result).toEqual({ sequence: 15, receiptNumber: 'OR-20261004-000015' })
    expect(calls.some((sql) => sql.includes('LAST_INSERT_ID(last_number + 1)'))).toBe(true)
  })

  it('nets voids and refunds on the day they happen', () => {
    const summary = summarizeLedgerRows([
      { kind: 'payment', amount: 1000 },
      { kind: 'payment', amount: 500 },
      { kind: 'void', amount: 500 },
      { kind: 'refund', amount: 200 },
    ])
    expect(summary).toEqual({ gross_received: 1500, voided: 500, collected: 1000, refunded: 200, net_collected: 800 })
  })

  it('never reads a saved billing row id as a catalog service id', async () => {
    const executor = { query: async () => { throw new Error('catalog must not be queried') } }
    const items = await normalizeBillingItems([
      { id: 5, billing_id: 9, source_type: 'staff_custom', service_name: 'Medical certificate', unit_price: 300, quantity: 1 },
    ], executor)
    expect(items[0].item_type).toBe('custom')
    expect(items[0].catalog_service_id).toBe(null)
  })

  it('requires whole units for checkout medicines', async () => {
    const executor = { query: async () => [[{ id: 3, name: 'Biogesic', unit: 'tablet', uom: 'tablet', selling_price: 12 }]] }
    await expect(normalizeBillingItems([{ item_type: 'supply', source_inventory_id: 3, quantity: 1.5 }], executor))
      .rejects.toMatchObject({ code: 'WHOLE_UNIT_QUANTITY_REQUIRED' })
  })

  it('pins every database session to clinic time', () => {
    const connect = read('server', 'db', 'connect.js')
    expect(connect).toContain("db.on('connection'")
    expect(connect).toContain('SET time_zone = ?')
  })

  it('resolves locations by role and no longer auto-creates them', () => {
    const batches = read('server', 'utils', 'inventoryBatches.js')
    expect(batches).toContain('resolveMainStockroom')
    expect(batches).toContain("options.createIfMissing === true")
    const doctor = read('server', 'controllers', 'doctor.controller.js')
    expect(doctor).not.toContain("'Dermatology Room'")
    expect(doctor).toContain('resolveClinicTreatmentRoom')
  })

  it('wires sequential receipts and the cashier drawer into payment', () => {
    const staff = read('server', 'controllers', 'staff.controller.js')
    const payStart = staff.indexOf('const payBill')
    const payBlock = staff.slice(payStart, staff.indexOf('const confirmBillPayment', payStart))
    expect(payBlock).toContain('allocateReceiptNumber(conn)')
    expect(payBlock).toContain('assertCashierOpen')
    // Checkout medicines are still deducted only when the bill becomes fully paid.
    expect(payBlock).toContain("if (nextStatus === 'paid')")
  })

  it('registers the new admin and staff routes before /billing/:id', () => {
    const admin = read('server', 'routers', 'admin.router.js')
    expect(admin.indexOf("'/billing/cashier-closing'")).toBeLessThan(admin.indexOf("router.get('/billing/:id'"))
    for (const route of ["'/billing/:id/void'", "'/billing/:id/reopen'", "'/billing/:id/stock-usage'", "'/billing/:id/consumables/:usageBatchId/return'", "'/inventory/:id/move-location'", "'/billing/cashier-closings/:closingId/reopen'"]) {
      expect(admin).toContain(route)
    }
    const staffRouter = read('server', 'routers', 'staff.router.js')
    expect(staffRouter.indexOf("'/billing/cashier-closing'")).toBeLessThan(staffRouter.indexOf("router.get('/billing/:id'"))
    expect(staffRouter).toContain("'/inventory/:id/move-location'")
  })

  it('shows most used medicines in Reports', () => {
    const reports = read('client', 'src', 'pages', 'adminPage', 'Admin_Reports.jsx')
    expect(reports).toContain('Most Used Medicines')
    expect(reports).toContain('mostUsedMedicines')
    const controller = read('server', 'controllers', 'admin.controller.js')
    expect(controller).toContain("loadMostUsedMedicines({ startDate, endDate, itemType: 'medicine'")
  })
})
