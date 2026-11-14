const fs = require('fs')
const path = require('path')

describe('clinical upload authorization handler', () => {
  it('uses the defined appointment authorization helper', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'),
      'utf8'
    )

    expect(source).toContain('const getClinicalUploadAppointment = async')
    expect(source).toMatch(/await getClinicalUploadAppointment\(appointmentId,\s*req.user.id,\s*req.branchId\)/)
    expect(source).not.toContain('getClinicalUploadScanStatus')
    expect(source).not.toContain('assertClinicalUploadAppointment')
  })
})
