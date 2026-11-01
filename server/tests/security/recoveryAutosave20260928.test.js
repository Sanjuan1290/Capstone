const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..', '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

describe('Batch 1 recovery and consultation autosave regressions', () => {
  it('exposes role-aware Admin recovery without weakening enumeration protection', () => {
    const app = read('client', 'src', 'App.jsx')
    const adminLogin = read('client', 'src', 'pages', 'auth', 'Admin', 'AdminLogin.jsx')
    const portalLogin = read('client', 'src', 'pages', 'auth', 'Admin', 'PortalAdminLogin.jsx')
    const forgot = read('client', 'src', 'pages', 'auth', 'ForgotPassword.jsx')
    const auth = read('server', 'controllers', 'auth.controller.js')

    expect(app).toContain("path='/admin/forgot-password'")
    expect(app).toContain('<ForgotPassword role="admin" />')
    expect(adminLogin).toContain('<PortalAdminLogin portal="admin" />')
    expect(portalLogin).toContain("forgotPath: '/admin/forgot-password'")
    expect(portalLogin).toContain('config.forgotPath')
    expect(forgot).toContain("admin:   { accent: '#f59e0b'")
    expect(auth).toMatch(/admin:\s*\{\s*table:\s*'admins',\s*where:\s*"email = \? AND account_role = 'admin' AND is_active = 1"/)
    expect(auth).toContain('If an account matches the information provided, a verification code will be sent.')
    expect(auth).not.toContain('RECOVERY_ACCOUNT_NOT_FOUND')
  })

  it('accepts verified email or mobile recovery for every portal without revealing unverified accounts', () => {
    const forgot = read('client', 'src', 'pages', 'auth', 'ForgotPassword.jsx')
    const auth = read('server', 'controllers', 'auth.controller.js')

    expect(forgot).toContain("const effectiveMethod = identifier.includes('@') ? 'email' : 'sms'")
    expect(forgot).toContain('Enter your verified email address or mobile number.')
    expect(forgot).toContain('delivery_method: effectiveMethod')
    expect(auth).toContain("const deliveryMethod = requestedMethod === 'sms' ? 'sms' : 'email'")
    expect(auth).toContain('Boolean(account.phone_verified_at)')
    expect(auth).toContain('Boolean(account.email_verified_at)')
    expect(auth).toContain('if (!channelVerified) return res.json({ ...generic, request_started: true })')
    expect(auth).toContain("if (deliveryMethod === 'sms' && !account.phone_verified_at)")
    expect(auth).not.toContain('RECOVERY_ACCOUNT_NOT_FOUND')
  })

  it('keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button', () => {
    const doctorController = read('server', 'controllers', 'doctor.controller.js')
    const consultation = read('client', 'src', 'pages', 'doctorPage', 'Doctor_Consultation.jsx')
    const draftStart = doctorController.indexOf('const saveConsultationDraft')
    const finalizeStart = doctorController.indexOf('const finalizeConsultation')
    const draftBlock = doctorController.slice(draftStart, finalizeStart)
    const finalizeBlock = doctorController.slice(finalizeStart, doctorController.indexOf('const getConsultation', finalizeStart))

    expect(draftBlock).not.toContain('validateClinicalInventoryAvailability')
    expect(finalizeBlock).not.toContain('validateClinicalInventoryAvailability')
    expect(finalizeBlock).toContain('consumeClinicalInventory')
    expect(consultation).toContain('window.setTimeout(() => { persistDraft() }, 1500)')
    expect(consultation).toContain('window.setInterval(() => { persistDraft() }, 30000)')
    expect(consultation).toContain('Consultation progress saves automatically as you work.')
    expect(consultation).toContain('Fixed service consumables and any Extra Consumables are stocked out only when you complete the consultation. Prescriptions do not affect inventory.')
    expect(consultation).not.toContain('Save Draft</')
    expect(consultation).not.toContain('Draft autosaves every 25 seconds.')
  })
})


