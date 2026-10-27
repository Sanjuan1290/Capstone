const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 29 Batch 6A — patient registration cleanup', () => {
  it('removes the redundant SMS verification information card while preserving SMS OTP registration', () => {
    const source = read('client', 'src', 'pages', 'auth', 'Patient', 'PatientRegister.jsx')
    expect(source).not.toContain('Registration no longer uses email verification.')
    expect(source).not.toContain('<p className=\"font-bold\">SMS verification</p>')
    expect(source).toContain('Verify Mobile Number')
    expect(source).toContain('Verify Your Mobile Number')
    expect(source).toContain('6-Digit Verification Code')
    expect(source).toContain('Resend SMS code')
  })

  it('keeps registration SMS-only at the request payload level', () => {
    const source = read('client', 'src', 'pages', 'auth', 'Patient', 'PatientRegister.jsx')
    const controller = read('server', 'controllers', 'patient.controller.js')
    expect(source).toContain("verification_method: 'sms'")
    expect(controller).toContain("const method = 'sms'")
  })
})
