const fs = require('fs')
const path = require('path')

describe('clinical upload scan-status handler', () => {
  it('uses the defined appointment authorization helper', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'),
      'utf8'
    )

    expect(source).toContain('const getClinicalUploadAppointment = async')
    expect(source).toContain('await getClinicalUploadAppointment(appointmentId, req.user.id)')
    expect(source).not.toContain('assertClinicalUploadAppointment')
  })
})

