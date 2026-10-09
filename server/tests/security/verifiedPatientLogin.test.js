const fs = require('fs')
const path = require('path')

describe('patient login channel verification policy', () => {
  it('allows email/password sign-in without making email verification a login requirement', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../controllers/patient.controller.js'), 'utf8')
    expect(source).toContain('unverified_phone_login')
    expect(source).not.toContain('unverified_email_login')
    expect(source).not.toContain('This email address has not been verified for sign-in')
  })

  it('shows unverified email as an actionable warning in Patient settings', () => {
    const settings = fs.readFileSync(path.join(__dirname, '../../../client/src/pages/shared/SettingsPage.jsx'), 'utf8')
    const layout = fs.readFileSync(path.join(__dirname, '../../../client/src/components/layouts/PatientLayout.jsx'), 'utf8')
    const accountSettings = fs.readFileSync(path.join(__dirname, '../../utils/accountSettings.js'), 'utf8')
    expect(accountSettings).toContain('email_verified_at')
    expect(settings).toContain('Email not verified')
    expect(settings).toContain('You can still sign in normally')
    expect(settings).toContain('Verify Email')
    expect(settings).toContain('requestPatientEmailVerificationCode')
    expect(settings).toContain('confirmPatientEmailVerification')
    expect(layout).toContain('settingsActionCount')
    expect(layout).toContain('bg-red-500')
  })

  it('provides a rate-limited Patient email verification flow', () => {
    const controller = fs.readFileSync(path.join(__dirname, '../../controllers/common.controller.js'), 'utf8')
    const router = fs.readFileSync(path.join(__dirname, '../../routers/patient.router.js'), 'utf8')
    const service = fs.readFileSync(path.join(__dirname, '../../../client/src/services/portal.service.js'), 'utf8')
    expect(router).toContain("/security/email/request-code")
    expect(router).toContain("/security/email/verify")
    expect(router).toContain('otpRequestLimiter')
    expect(router).toContain('otpVerifyLimiter')
    expect(controller).toContain("purpose: 'patient_email_verification'")
    expect(controller).toContain('email_verified_at = NOW()')
    expect(controller).toContain('EMAIL_VERIFICATION_RESTART_REQUIRED')
    expect(service).toContain('requestPatientEmailVerificationCode')
    expect(service).toContain('confirmPatientEmailVerification')
  })

  it('marks a newly verified phone as verified when a phone change is confirmed', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../utils/accountSecurity.js'), 'utf8')
    expect(source).toContain('phone_verified_at = NOW()')
  })
})

