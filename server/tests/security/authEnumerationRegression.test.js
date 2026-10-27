const fs = require('fs')
const path = require('path')

describe('password recovery enumeration regression', () => {
  it('does not return an account-not-found recovery response', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../controllers/auth.controller.js'), 'utf8')
    expect(source).not.toContain('RECOVERY_ACCOUNT_NOT_FOUND')
    expect(source).toContain('If an account matches the information provided, a verification code will be sent.')
  })

  it('requires a verified patient channel before that channel can be used for recovery', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../controllers/auth.controller.js'), 'utf8')
    expect(source).toContain('account.phone_verified_at')
    expect(source).toContain('account.email_verified_at')
  })
})

