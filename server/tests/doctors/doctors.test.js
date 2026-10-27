const { toDateOnly, isValidDateOnly } = require('../../utils/doctorAvailability')

describe('doctor availability dates', () => {
  it('accepts ISO date-only values', () => {
    expect(toDateOnly('2026-07-21T08:00:00')).toBe('2026-07-21')
    expect(isValidDateOnly('2026-07-21')).toBe(true)
    expect(isValidDateOnly('07/21/2026')).toBe(false)
  })
})

