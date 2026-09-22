const fs = require('fs')
const path = require('path')

describe('consultation draft/finalize API contract', () => {
  it('exposes separate draft and finalize routes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'routers', 'doctor.router.js'), 'utf8')
    expect(source).toMatch(/put\('\/consultations\/:appointmentId\/draft'/i)
    expect(source).toMatch(/post\('\/consultations\/:appointmentId\/finalize'/i)
  })

  it('keeps inventory consumption in finalization rather than draft save', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'), 'utf8')
    const draftStart = source.indexOf('const saveConsultationDraft')
    const finalizeStart = source.indexOf('const finalizeConsultation')
    const getStart = source.indexOf('const getConsultation', finalizeStart)
    const draftBlock = source.slice(draftStart, finalizeStart)
    const finalizeBlock = source.slice(finalizeStart, getStart)
    expect(draftBlock).not.toContain('consumeClinicalInventory')
    expect(finalizeBlock).toContain('consumeClinicalInventory')
    expect(finalizeBlock).toContain("status='finalized'")
  })
})
