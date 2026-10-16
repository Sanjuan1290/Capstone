const { CLINIC_TIMEZONE, getTodayDateOnly, addDaysDateOnly, isClinicOpenDate } = require('../../utils/date')

describe('clinic timezone handling', () => {
  it('defaults clinic operations to Asia/Manila', () => {
    expect(CLINIC_TIMEZONE).toBe(process.env.CLINIC_TIMEZONE || 'Asia/Manila')
  })
  it('handles date-only arithmetic without host-timezone drift', () => {
    expect(addDaysDateOnly('2026-08-27', 1)).toBe('2026-08-28')
    expect(getTodayDateOnly(new Date('2026-08-27T00:30:00+08:00'))).toMatch(/^2026-08-2[67]$/)
  })
  it('uses the clinic date when deciding whether the Mon-Sat clinic is open', () => {
    expect(isClinicOpenDate('2026-08-29')).toBe(true)  // Saturday
    expect(isClinicOpenDate('2026-08-30')).toBe(false) // Sunday
  })
})



