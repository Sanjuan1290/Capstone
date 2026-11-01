const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')

describe('QA plan reconciliation guards', () => {
  it('keeps ordinary inventory removal archive-only and hides archived items', () => {
    const source = read('controllers', 'admin.controller.js')
    const start = source.indexOf('const deleteInventoryItem = async')
    const end = source.indexOf('const getInventoryBatchHistory', start)
    const handler = source.slice(start, end)

    expect(source).toContain("loadInventoryRows(db, 'WHERE archived_at IS NULL')")
    expect(handler).toContain('UPDATE inventory SET archived_at=NOW()')
    expect(handler).not.toMatch(/DELETE\s+FROM\s+inventory\s+WHERE/i)
  })

  it('does not infer patient Selling Price from legacy inventory cost', () => {
    const migration = read('db', 'migrations', '2026-09-24-inventory-single-selling-price.sql')
    expect(migration).not.toMatch(/SET\s+selling_price\s*=\s*price/i)
    expect(migration).not.toMatch(/SET\s+b\.unit_cost\s*=\s*i\.selling_price/i)
  })

  it('serializes duplicate pending doctor stock requests', () => {
    const source = read('controllers', 'doctor.controller.js')
    const start = source.indexOf('const submitRequest = async')
    const end = source.indexOf('const getMyQueue', start)
    const handler = source.slice(start, end)

    // Doctors may work at multiple branches. Lock their active assignment for
    // the current branch, then check duplicate requests in the same transaction.
    expect(handler).toContain('await conn.beginTransaction()')
    expect(handler).toMatch(/SELECT d\.id FROM doctors d JOIN doctor_branch_assignments a ON a\.doctor_id=d\.id AND a\.branch_id=\? AND a\.is_active=1 WHERE d\.id=\? FOR UPDATE/)
    expect(handler).toMatch(/\[req\.branchId,\s*req\.user\.id\]/)
    expect(handler).toContain("g.status='pending'")
    expect(handler).toContain('g.appointment_id=?')
    expect(handler).toContain('g.destination_location_id=?')
    expect(handler).toContain("code: 'DUPLICATE_SUPPLY_REQUEST'")
    expect(handler).toContain('await conn.rollback()')
  })

  it('keeps runtime schema reconciliation aligned with the September 25 hardening fields', () => {
    const source = read('utils', 'schema.js')
    for (const field of [
      'archived_by_admin_id',
      'email_verified_at',
      'phone_verified_at',
      'allow_decimal_quantity',
      'decimal_precision',
      'supplier_id',
      'source_location_id',
      'uniq_account_security_code_purpose',
    ]) {
      expect(source).toContain(field)
    }
  })
})

