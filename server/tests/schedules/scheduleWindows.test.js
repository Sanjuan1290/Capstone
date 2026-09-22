const {
  getScheduleWindow,
  validateSchedulePayload,
  isTimeCoveredByWeeklySchedule,
  buildSlotsForCalendarDate,
} = require('../../utils/scheduleWindows')

describe('doctor schedule windows', () => {
  it('supports a normal same-day schedule', () => {
    const schedule = validateSchedulePayload({ day_of_week: 'Monday', start_time: '08:00', end_time: '17:00', slot_duration_mins: 60, is_active: 1 })
    expect(getScheduleWindow(schedule)).toMatchObject({ start: 480, end: 1020, duration: 540, spansNextDay: false })
  })

  it('supports an overnight schedule up to 24 hours', () => {
    const schedule = validateSchedulePayload({ day_of_week: 'Monday', start_time: '20:00', end_time: '02:00', spans_next_day: 1, slot_duration_mins: 60, is_active: 1 })
    expect(getScheduleWindow(schedule)).toMatchObject({ start: 1200, end: 1560, duration: 360, spansNextDay: true })
  })

  it('supports a full 24-hour calendar day', () => {
    const schedule = validateSchedulePayload({ day_of_week: 'Monday', is_24_hours: 1, slot_duration_mins: 60, is_active: 1 })
    expect(schedule).toMatchObject({ start_time: '00:00', end_time: '00:00', spans_next_day: 1, is_24_hours: 1 })
    expect(getScheduleWindow(schedule).duration).toBe(1440)
  })

  it('allows an explicit overnight window of exactly 24 hours', () => {
    const schedule = validateSchedulePayload({ day_of_week: 'Monday', start_time: '08:00', end_time: '08:00', spans_next_day: 1, slot_duration_mins: 60, is_active: 1 })
    expect(getScheduleWindow(schedule)).toMatchObject({ start: 480, end: 1920, duration: 1440, spansNextDay: true })
  })

  it('rejects an overnight range longer than 24 hours', () => {
    expect(() => validateSchedulePayload({ day_of_week: 'Monday', start_time: '08:00', end_time: '17:00', spans_next_day: 1, slot_duration_mins: 60 }))
      .toThrow(/cannot exceed 24 hours/i)
  })

  it('covers after-midnight appointments using the previous day overnight schedule', () => {
    const schedules = [{ day_of_week: 'Monday', start_time: '20:00', end_time: '02:00', spans_next_day: 1, is_24_hours: 0, slot_duration_mins: 60, is_active: 1 }]
    expect(isTimeCoveredByWeeklySchedule({ date: '2026-09-22', time: '1:00 AM', schedules })).toBe(true) // Tuesday
    expect(isTimeCoveredByWeeklySchedule({ date: '2026-09-22', time: '3:00 AM', schedules })).toBe(false)
  })

  it('builds Monday evening and Tuesday after-midnight slots from one overnight schedule', () => {
    const schedules = [{ day_of_week: 'Monday', start_time: '20:00', end_time: '02:00', spans_next_day: 1, is_24_hours: 0, slot_duration_mins: 60, is_active: 1 }]
    expect(buildSlotsForCalendarDate({ date: '2026-09-21', schedules }).map((slot) => slot.time)).toEqual(['8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'])
    expect(buildSlotsForCalendarDate({ date: '2026-09-22', schedules }).map((slot) => slot.time)).toEqual(['12:00 AM', '1:00 AM'])
  })
})
