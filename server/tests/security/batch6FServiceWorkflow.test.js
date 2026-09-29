const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 6F empty service workflow', () => {
  it('gives patients a clinic-specific recovery path when services disappear', () => {
    const source = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(source).toContain('No active {doctorClinicLabel(clinicType)} services are available for online booking.')
    expect(source).toContain('Choose Another Clinic')
    expect(source).toContain('if (normalizedRows.length === 0) await loadBookingReadiness()')
  })

  it('shows administrators which clinic is missing an active service', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingCatalog.jsx')
    expect(source).toContain('Online booking services need attention')
    expect(source).toContain('missingActiveClinics')
    expect(source).toContain('Add {clinicLabel(clinic)} Service')
    expect(source).toContain('No services configured yet')
    expect(source).toContain('No {clinicLabel(filter)} services configured')
    expect(source).toContain("['medical', 'all'].includes(service.clinic_type)")
  })

  it('preselects the target clinic when Admin follows a service setup action', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_BillingServiceForm.jsx')
    const dashboard = read('client', 'src', 'pages', 'adminPage', 'Admin_Dashboard.jsx')
    expect(source).toContain("searchParams.get('clinic')")
    expect(source).toContain('clinic_type: requestedClinic')
    expect(dashboard).toContain("firstIssue === 'NO_ACTIVE_SERVICE'")
    expect(dashboard).toContain('`${baseAction.path}?clinic=${id}`')
  })
})
