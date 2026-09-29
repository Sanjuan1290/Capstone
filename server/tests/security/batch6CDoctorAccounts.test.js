const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 29 Batch 6C — Doctor Account classification cleanup', () => {
  it('uses Clinic Assignment as the only editable doctor classification', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_DoctorAccount.jsx')
    expect(source).toContain('Clinic Assignment')
    expect(source).toContain("{ value: 'medical', label: 'General Medicine' }")
    expect(source).toContain("{ value: 'derma', label: 'Dermatology' }")
    expect(source).not.toContain('Clinical Specialty')
    expect(source).not.toContain('form.specialty')
    expect(source).not.toContain('Search name or specialty')
  })

  it('shows the clinic assignment in doctor account list/detail views', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_DoctorAccount.jsx')
    expect(source).toContain("isDerma ? 'Dermatology' : 'General Medicine'")
    expect(source).toContain('Search name, email, or clinic')
    expect(source).not.toContain('doc.specialty')
    expect(source).not.toContain('doctor.specialty')
  })

  it('does not write specialty from Admin doctor create/update payloads', () => {
    const source = read('server', 'controllers', 'admin.controller.js')
    expect(source).toContain("const { full_name, email, phone, clinic_type, prc_license } = req.body")
    expect(source).toContain('INSERT INTO doctors (full_name, email, phone, clinic_type, prc_license, password, must_change_password)')
    expect(source).toContain('UPDATE doctors SET full_name = ?, email = ?, phone = ?, clinic_type = ?, prc_license = ? WHERE id = ?')
  })

  it('keeps the legacy specialty column readable for backward compatibility', () => {
    const source = read('server', 'controllers', 'admin.controller.js')
    expect(source).toContain('SELECT id, full_name, email, phone, specialty, clinic_type, clinic_type AS type, prc_license, is_active, created_at FROM doctors WHERE id = ?')
  })
})
