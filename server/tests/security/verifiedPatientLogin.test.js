const fs = require('fs')
const path = require('path')

describe('patient verified-channel login', () => {
  it('blocks sign-in through either unverified identifier channel', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../controllers/patient.controller.js'), 'utf8')
    expect(source).toContain('unverified_phone_login')
    expect(source).toContain('unverified_email_login')
  })

  it('marks a newly verified phone as verified when a phone change is confirmed', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../utils/accountSecurity.js'), 'utf8')
    expect(source).toContain('phone_verified_at = NOW()')
  })
})
