const { parseTimeToMinutes, assertAppointmentTransition, validateAppointmentSlot } = require('../../utils/appointmentSecurity')

describe('appointment server-side security', () => {
  it('parses 12-hour and database time formats consistently', () => {
    expect(parseTimeToMinutes('8:30 AM')).toBe(510)
    expect(parseTimeToMinutes('17:00:00')).toBe(1020)
  })

  it('rejects impossible status transitions', () => {
    expect(() => assertAppointmentTransition('completed', 'cancelled')).toThrow(/cannot move/i)
    expect(() => assertAppointmentTransition('confirmed', 'in-progress')).not.toThrow()
  })

  it('rejects a time outside the doctor schedule even when the client submits it manually', async () => {
    const executor = {
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 2, full_name: 'Dr Test', specialty: 'General Medicine' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ start_time: '08:00:00', end_time: '17:00:00', slot_duration_mins: 60 }]]),
    }
    await expect(validateAppointmentSlot({ doctorId: 2, clinicType: 'medical', date: '2026-08-28', time: '2:37 AM', executor }))
      .rejects.toThrow(/outside/i)
  })
})
