const fs = require('fs')
const path = require('path')
const { getNoShowGraceMinutes } = require('../../utils/appointments')

describe('automatic no-show policy', () => {
  it('defaults to a 15 minute grace period', () => {
    const previous = process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES
    delete process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES
    expect(getNoShowGraceMinutes()).toBe(15)
    if (previous === undefined) delete process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES
    else process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES = previous
  })

  it('excludes walk-ins and checked-in patients from the automatic no-show update', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'appointments.js'), 'utf8')
    expect(source).toMatch(/checked_in_at\s+IS\s+NULL/i)
    expect(source).toMatch(/appointment_source[^\n]+walk_in/i)
    expect(source).toMatch(/APPOINTMENT_NO_SHOW_GRACE_MINUTES/)
  })
})
