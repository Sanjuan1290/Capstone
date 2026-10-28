const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 29 Batch 6D — doctor display normalization', () => {
  it('maps operational doctor labels from clinic_type only', () => {
    const helper = read('client', 'src', 'utils', 'doctor.js')
    expect(helper).toContain("if (value === 'derma') return 'Dermatology'")
    expect(helper).toContain("if (value === 'medical') return 'General Medicine'")
    expect(helper).not.toContain('specialty')
  })

  it('removes generic specialty fallbacks from the doctor portal shell', () => {
    const layout = read('client', 'src', 'components', 'layouts', 'DoctorLayout.jsx')
    expect(layout).toContain('doctorClinicLabel(user)')
    expect(layout).not.toContain("'Physician'")
  })

  it('shows clinic assignment instead of specialty in patient booking', () => {
    const booking = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(booking).toContain('Clinic Assignment:')
    expect(booking).not.toContain('Specialty:')
    expect(booking).not.toContain('Not specified')
  })

  it('makes doctor settings clinic assignment read-only', () => {
    const client = read('client', 'src', 'pages', 'shared', 'SettingsPage.jsx')
    const server = read('server', 'utils', 'accountSettings.js')
    expect(client).toContain('Clinic Assignment is managed by an Administrator.')
    expect(client).not.toContain("onChange('specialty')")
    expect(server).toContain("doctor: 'id, full_name, email, phone, clinic_type, theme_preference, profile_image_url'")
    expect(server).not.toContain("doctor: ['full_name', 'phone', 'specialty'")
  })

  it('uses clinic assignment in reports instead of specialty', () => {
    const reports = read('client', 'src', 'pages', 'adminPage', 'Admin_Reports.jsx')
    expect(reports).toContain('Clinic Assignment')
    expect(reports).toContain('doctorClinicLabel(doctor)')
    expect(reports).not.toContain('<th>Specialty</th>')
  })
})
