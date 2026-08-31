const { createClinicalUploadSignature, makeCloudinarySignature } = require('../../utils/cloudinarySecurity')

describe('signed clinical uploads', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
    process.env.CLOUDINARY_CLINICAL_FOLDER = 'carait-clinic/clinical'
  })

  it('keeps the API secret on the server and returns only signed upload fields', () => {
    const result = createClinicalUploadSignature({ doctorId: 4, appointmentId: 19 })
    expect(result.cloud_name).toBe('test-cloud')
    expect(result.api_key).toBe('test-key')
    expect(result.folder).toContain('doctor-4/appointment-19')
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/)
    expect(result.api_secret).toBeUndefined()
  })

  it('produces deterministic Cloudinary signatures for the same canonical parameters', () => {
    expect(makeCloudinarySignature({ timestamp: 123, folder: 'a/b' }, 'secret'))
      .toBe(makeCloudinarySignature({ folder: 'a/b', timestamp: 123 }, 'secret'))
  })
})
