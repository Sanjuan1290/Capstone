const fs = require('fs')
const path = require('path')

describe('2026-09-28 schema blocker reconciliation', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'schema.js'), 'utf8')
  const verify = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'verifyDeployment.js'), 'utf8')
  const admin = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'admin.controller.js'), 'utf8')

  it('supports Admin recovery without a stale password reset role enum', () => {
    expect(schema).toContain("ALTER TABLE password_resets MODIFY COLUMN role VARCHAR(20) NOT NULL")
    expect(verify).toContain("password_resets.role must be VARCHAR(20+)")
  })

  it('stores transfer request quantities with two-decimal precision', () => {
    expect(schema).toContain("ALTER TABLE supply_requests MODIFY COLUMN qty_requested DECIMAL(12,2) NOT NULL")
    expect(verify).toContain("supply_requests.qty_requested must be DECIMAL")
  })

  it('stores configured movement reason codes without truncation', () => {
    expect(schema).toContain("ALTER TABLE inventory_logs MODIFY COLUMN movement_type VARCHAR(80)")
    expect(verify).toContain("inventory_logs.movement_type must be VARCHAR(80+)")
    expect(admin).toContain("80 - suffixText.length")
  })
})
