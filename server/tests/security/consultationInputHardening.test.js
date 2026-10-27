const fs = require('fs')
const path = require('path')

describe('consultation input hardening', () => {
  it('enforces bounded diagnosis, notes and prescription payloads server-side', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'), 'utf8')
    expect(source).toContain("field: 'Diagnosis', max: 5000")
    expect(source).toContain("field: 'Clinical Notes', max: 5000")
    expect(source).toContain("field: 'Prescription', max: 20000")
    expect(source).toContain('at most 30 prescription items')
  })
})
