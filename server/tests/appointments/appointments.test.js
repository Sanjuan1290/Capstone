const { ACTIVE_APPOINTMENT_STATUSES, makeNoShowWarningResponse } = require('../../utils/appointmentPolicies')
const { getTodayDateOnly, getCurrentTimeLabel } = require('../../utils/date')

describe('appointment rules', () => {
  it('keeps active statuses consistent', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).toEqual(['pending', 'confirmed', 'rescheduled', 'in-progress'])
  })

  it('formats clinic-local dates and times', () => {
    // 05:05 UTC is 1:05 PM in Manila. Built from UTC so the test passes on any machine time zone.
    const value = new Date(Date.UTC(2026, 6, 21, 5, 5))
    expect(getTodayDateOnly(value)).toBe('2026-07-21')
    expect(getCurrentTimeLabel(value)).toBe('1:05 PM')
  })

  it('returns a structured no-show warning', () => {
    const result = makeNoShowWarningResponse({ id: 4 })
    expect(result.code).toBe('NO_SHOW_WARNING')
    expect(result.last_no_show.id).toBe(4)
  })
})


