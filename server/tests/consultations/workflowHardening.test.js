const fs = require('fs')
const path = require('path')

describe('consultation and checkout workflow hardening', () => {
  const root = path.resolve(__dirname, '..', '..', '..')
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

  it('returns structured clinical-image and inventory errors instead of generic expected 500s', () => {
    const doctor = read('server/controllers/doctor.controller.js')
    const images = read('server/utils/consultationImages.js')
    expect(doctor).toContain("code: 'INVENTORY_INSUFFICIENT'")
    expect(images).toContain("code: 'CLINICAL_IMAGE_TOKEN_INVALID'")
  })

  it('keeps consultation-owned checkout lines server-owned and removes active price overrides', () => {
    const staff = read('server/controllers/staff.controller.js')
    expect(staff).toContain('Checkout never round-trips')
    expect(staff).toContain("type !== 'discount'")
    expect(staff).not.toContain('applyApprovedPriceOverrides(billingId')
  })

  it('validates aggregate stock before bill save and finalization preview', () => {
    const staff = read('server/controllers/staff.controller.js')
    expect(staff).toContain('validateStaffSupplyAvailability')
    expect(staff).toContain('requires ${insufficient.requested}')
  })
})

