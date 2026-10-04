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
    expect(source).toContain("SELECT id FROM doctors WHERE id=? FOR UPDATE")
    expect(source).toContain("status='pending'")
    expect(source).toContain("code: 'DUPLICATE_SUPPLY_REQUEST'")
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
