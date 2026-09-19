const { isValidSupplyRequestResolution } = require('../../utils/workflowValidation')

describe('supply request resolution', () => {
  it('allows approval or rejection only', () => {
    expect(isValidSupplyRequestResolution('approved')).toBe(true)
    expect(isValidSupplyRequestResolution('rejected')).toBe(true)
    expect(isValidSupplyRequestResolution('pending')).toBe(false)
  })
})
