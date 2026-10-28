const fs = require('fs')
const path = require('path')
const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Doctor branch guard regressions', () => {
  it('scopes appointment selection, queue reads, and stock transfer references', () => {
    const source = read('server', 'controllers', 'doctor.controller.js')
    expect(source).toContain('WHERE a.doctor_id=? AND a.branch_id=?')
    expect(source).toContain('WHERE q.doctor_id = ? AND q.branch_id = ? AND q.queue_date = ?')
    expect(source).toContain('WHERE appointment_id=? AND doctor_id=? AND branch_id=? LIMIT 1')
    expect(source).toContain('SELECT clinic_type FROM doctors WHERE id=? AND branch_id=? LIMIT 1')
  })

  it('persists stock-transfer audit and notifications with explicit branch ownership', () => {
    const source = read('server', 'controllers', 'doctor.controller.js')
    const auditBlock = source.slice(source.indexOf("action: 'supply.request_created'"), source.indexOf('}, conn)', source.indexOf("action: 'supply.request_created'")))
    expect(auditBlock).toContain('branchId: req.branchId')
    expect(source).toContain("reference_type: 'supply_request_group'")
    expect(source).toContain('branch_id: req.branchId')
  })
})
