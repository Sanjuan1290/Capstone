const { authorizeConsultationImages } = require('../../utils/consultationImages')
const { issueAcceptedUploadToken } = require('../../utils/cloudinarySecurity')

describe('upload security integrity', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough'
  })

  const executorWithExisting = (rows = []) => ({
    query: vi.fn(async (sql) => {
      if (String(sql).includes('SELECT image_url, security_scan_status')) return [rows]
      throw new Error(`Unexpected query: ${sql}`)
    }),
  })

  it('does not trust an approved status supplied by the browser for a new clinical image', async () => {
    const executor = executorWithExisting([])
    await expect(authorizeConsultationImages({
      consultationId: 10,
      appointmentId: 20,
      doctorId: 7,
      images: [{ image_url: 'https://res.cloudinary.com/test/image/upload/new.png', security_scan_status: 'approved' }],
      executor,
    })).rejects.toMatchObject({ code: 'UPLOAD_SECURITY_TOKEN_REQUIRED' })
  })

  it('accepts a new clinical image only with server-signed accepted upload proof', async () => {
    const url = 'https://res.cloudinary.com/test/image/upload/new.png'
    const token = issueAcceptedUploadToken({
      role: 'doctor', userId: 7, contextType: 'clinical', contextId: 20,
      status: 'approved', assetId: 'asset-20', url, publicId: 'clinical/new',
    })
    const executor = executorWithExisting([])
    const result = await authorizeConsultationImages({
      consultationId: 10,
      appointmentId: 20,
      doctorId: 7,
      images: [{ image_url: url, security_scan_status: 'legacy', security_token: token }],
      executor,
    })
    expect(result[0].security_scan_status).toBe('approved')
    expect(result[0].security_token).toBeNull()
  })

  it('preserves the database scan status for an existing clinical image instead of trusting the browser', async () => {
    const url = 'https://res.cloudinary.com/test/image/upload/existing.png'
    const executor = executorWithExisting([{ image_url: url, security_scan_status: 'bypassed' }])
    const result = await authorizeConsultationImages({
      consultationId: 10,
      appointmentId: 20,
      doctorId: 7,
      images: [{ image_url: url, security_scan_status: 'approved' }],
      executor,
    })
    expect(result[0].security_scan_status).toBe('bypassed')
  })
})
