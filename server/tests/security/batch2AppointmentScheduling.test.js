const {
  DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  DEFAULT_ONLINE_MIN_LEAD_MINUTES,
  roundReservedDurationMinutes,
  isOnlineAppointmentStartAllowed,
} = require('../../utils/bookingPolicy')

describe('Batch 2 appointment scheduling policy', () => {
  it('uses 30-minute booking starts and a 12-hour patient notice', () => {
    expect(DEFAULT_BOOKING_START_INTERVAL_MINUTES).toBe(30)
    expect(DEFAULT_ONLINE_MIN_LEAD_MINUTES).toBe(720)
  })

  it('rounds configured service duration upward to the next 30-minute block', () => {
    expect(roundReservedDurationMinutes(15)).toBe(30)
    expect(roundReservedDurationMinutes(30)).toBe(30)
    expect(roundReservedDurationMinutes(45)).toBe(60)
    expect(roundReservedDurationMinutes(75)).toBe(90)
    expect(roundReservedDurationMinutes(90)).toBe(90)
    expect(roundReservedDurationMinutes(105)).toBe(120)
    expect(roundReservedDurationMinutes(480)).toBe(480)
  })

  it('blocks a patient start that is less than 12 hours away', () => {
    const now = new Date('2026-09-29T10:45:00+08:00')
    expect(isOnlineAppointmentStartAllowed({ date: '2026-09-29', time: '10:30 PM', minLeadMinutes: 720, now })).toBe(false)
    expect(isOnlineAppointmentStartAllowed({ date: '2026-09-29', time: '11:00 PM', minLeadMinutes: 720, now })).toBe(true)
  })
})


