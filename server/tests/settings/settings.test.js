const { normalizeOptionalImageUrl } = require('../../utils/settingsValidation')

describe('payment settings', () => {
  it('allows HTTPS and app-relative QR image paths', () => {
    expect(normalizeOptionalImageUrl('https://example.com/qr.png')).toBe('https://example.com/qr.png')
    expect(normalizeOptionalImageUrl('/uploads/qr.png')).toBe('/uploads/qr.png')
    expect(normalizeOptionalImageUrl('javascript:alert(1)')).toBeNull()
  })
})



