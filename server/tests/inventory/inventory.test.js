const { normalizeExpiryDate } = require('../../utils/inventoryBatches')

describe('inventory expiry dates', () => {
  it('normalizes valid date-only values and clears invalid input', () => {
    expect(normalizeExpiryDate('2028-10-27T00:00:00')).toBe('2028-10-27')
    expect(normalizeExpiryDate('')).toBeNull()
    expect(normalizeExpiryDate('not-a-date')).toBeNull()
  })
})

