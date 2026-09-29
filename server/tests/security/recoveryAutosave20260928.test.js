const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

describe('Batch 1 recovery and consultation autosave regressions', () => {
  it('exposes role-aware Admin recovery without weakening enumeration protection', () => {
    const app = read('client', 'src', 'App.jsx')
    const adminLogin = read('client', 'src', 'pages', 'auth', 'Admin', 'AdminLogin.jsx')
    const forgot = read('client', 'src', 'pages', 'auth', 'ForgotPassword.jsx')
    const auth = read('server', 'controllers', 'auth.controller.js')

    expect(app).toContain("path='/admin/forgot-password'")
    expect(app).toContain('<ForgotPassword role="admin" />')
    expect(adminLogin).toContain('/admin/forgot-password')
    expect(forgot).toContain("admin:   { accent: '#f59e0b'")
    expect(auth).toContain("admin: { table: 'admins', where: 'email = ?' }")
    expect(auth).toContain('If an account matches the information provided, a verification code will be sent.')
    expect(auth).not.toContain('RECOVERY_ACCOUNT_NOT_FOUND')
  })

  it('uses verified SMS recovery for Patient UI and does not offer an unverified email fallback', () => {
    const forgot = read('client', 'src', 'pages', 'auth', 'ForgotPassword.jsx')
    expect(forgot).toContain("useState(isPatient ? 'sms' : 'email')")
    expect(forgot).toContain("const effectiveMethod = isPatient ? 'sms' : deliveryMethod")
    expect(forgot).toContain('mobile number verified during Patient registration')
    expect(forgot).not.toContain('Try another way')
  })

  it('keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button', () => {
    const doctorController = read('server', 'controllers', 'doctor.controller.js')
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    const draftStart = doctorController.indexOf('const saveConsultationDraft')
    const finalizeStart = doctorController.indexOf('const finalizeConsultation')
    const draftBlock = doctorController.slice(draftStart, finalizeStart)
    const finalizeBlock = doctorController.slice(finalizeStart, doctorController.indexOf('const getConsultation', finalizeStart))

    expect(draftBlock).not.toContain('validateClinicalInventoryAvailability')
    expect(finalizeBlock).toContain('validateClinicalInventoryAvailability')
    expect(finalizeBlock).toContain('consumeClinicalInventory')
    expect(consultation).toContain('window.setTimeout(() => { persistDraft() }, 1500)')
    expect(consultation).toContain('window.setInterval(() => { persistDraft() }, 30000)')
    expect(consultation).toContain('Consultation progress saves automatically as you work.')
    expect(consultation).toContain('Treatment-room inventory availability is checked only when you complete the consultation.')
    expect(consultation).not.toContain('Save Draft</')
    expect(consultation).not.toContain('Draft autosaves every 25 seconds.')
  })
})

