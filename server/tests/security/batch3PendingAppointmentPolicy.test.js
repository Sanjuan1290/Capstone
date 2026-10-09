vi.mock('../../db/connect', () => ({ query: vi.fn() }))

const {
  normalizeBookingSettings,
  validateBookingSettings,
  buildConfirmationDeadlineSql,
} = require('../../utils/bookingPolicy')

const { assertAppointmentTransition } = require('../../utils/appointmentSecurity')

describe('Batch 3 pending appointment policy', () => {
  it('uses the 720-minute notice and 60-minute confirmation cutoff defaults', () => {
    expect(normalizeBookingSettings({})).toMatchObject({
      online_min_lead_minutes: 720,
      pending_confirmation_cutoff_minutes: 60,
      booking_start_interval_minutes: 30,
    })
  })

  it('rejects a cutoff that leaves Staff no review window', () => {
    expect(() => validateBookingSettings({
      online_min_lead_minutes: 720,
      pending_confirmation_cutoff_minutes: 720,
    })).toThrow(/cutoff must be earlier/i)
  })

  it('builds the deadline one hour before the appointment by default policy input', () => {
    expect(buildConfirmationDeadlineSql({
      date: '2026-09-30',
      time: '11:00 PM',
      cutoffMinutes: 60,
      timeZone: 'Asia/Manila',
    })).toBe('2026-09-30 22:00:00')
  })

  it('allows pending appointments to transition to rejected', () => {
    expect(() => assertAppointmentTransition('pending', 'rejected')).not.toThrow()
  })
})


