const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 25 UI/workflow regressions', () => {
  it('does not reference the removed doctor appointment completed-state setter', () => {
    const source = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Appointments.jsx')
    expect(source).not.toContain('setShowCompleted(')
  })

  it('paginates all System Setup reference managers', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx')
    expect(source).toContain('useClientPagination(rows')
    expect(source).toContain('pagination.pageItems.map')
    expect(source).toContain('<Pagination {...pagination}')
  })

  it('uses a report range dropdown with custom-only date editing', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_Reports.jsx')
    expect(source).toContain("['custom', 'Custom']")
    expect(source).toContain("disabled={preset !== 'custom'}")
  })

  it('requires password plus email OTP for refund/void actions', () => {
    const server = read('server', 'controllers', 'admin.controller.js')
    const client = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingTransactionDetail.jsx')
    expect(server).toContain("BILLING_PAYMENT_ACTION_PURPOSE = 'billing_payment_action'")
    expect(server).toContain("bcrypt.compare(password, admin.password)")
    expect(server).toContain('confirmBillingPaymentAction')
    expect(client).toContain('Verify Password & Send Code')
    expect(client).toContain('6-Digit Verification Code')
  })

  it('keeps patient registration SMS-only while login accepts phone or email', () => {
    const register = read('client', 'src', 'pages', 'auth', 'Patient', 'PatientRegister.jsx')
    const login = read('client', 'src', 'pages', 'auth', 'Patient', 'PatientLogin.jsx')
    const controller = read('server', 'controllers', 'patient.controller.js')
    expect(register).toContain("verification_method: 'sms'")
    expect(register).not.toContain('Email Verification')
    expect(login).toContain('Mobile Number or Email')
    expect(controller).toContain("const method = 'sms'")
  })
})
