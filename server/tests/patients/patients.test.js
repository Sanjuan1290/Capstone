const { normalizePhilippinePhone, isValidPhilippinePhone, formatPhilippinePhone } = require('../../utils/phone')
const { normalizePatientProfileInput, getPatientProfileStatus } = require('../../utils/patientProfile')

describe('patient input rules', () => {
  it('normalizes Philippine mobile numbers', () => {
    expect(normalizePhilippinePhone('0917 123 4567')).toBe('639171234567')
    expect(isValidPhilippinePhone('+63 917 123 4567')).toBe(true)
    expect(formatPhilippinePhone('639171234567')).toBe('0917 123 4567')
  })

  it('rejects invalid profile values and reports missing fields', () => {
    const normalized = normalizePatientProfileInput({ gender: 'Unknown', birthdate: 'bad', address: '' })
    expect(normalized.gender).toBeNull()
    expect(normalized.birthdate).toBeNull()
    expect(getPatientProfileStatus(normalized).missing_fields).toEqual(['birthdate', 'gender', 'address'])
  })
})
