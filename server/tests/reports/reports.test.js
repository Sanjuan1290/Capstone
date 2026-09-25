const { resolveReportRange } = require('../../utils/reportRange')

describe('report date ranges', () => {
  it('uses explicit start and end dates', () => {
    expect(resolveReportRange({ start_date: '2026-01-01', end_date: '2026-07-21' }))
      .toEqual({ startDate: '2026-01-01', endDate: '2026-07-21' })
  })

  it('rejects an inverted date range', () => {
    expect(() => resolveReportRange({ start_date: '2026-07-22', end_date: '2026-07-21' })).toThrow('Start date cannot be after end date.')
  })

  it('keeps the three-month fallback for older clients', () => {
    const result = resolveReportRange({ period: '3months' }, new Date(2026, 6, 21))
    expect(result).toEqual({ startDate: '2026-04-21', endDate: '2026-07-21' })
  })
})

