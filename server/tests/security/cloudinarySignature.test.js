const {
  createClinicalUploadSignature,
  createPaymentQrUploadSignature,
  makeCloudinarySignature,
  getPerceptionPointScanStatus,
  findPerceptionPointModeration,
  isScannerUnavailableCloudinaryError,
  getScannerUnavailableReason,
  issueBypassAuthorizationToken,
  issueAcceptedUploadToken,
  verifyUploadSecurityToken,
} = require('../../utils/cloudinarySecurity')

describe('signed Cloudinary uploads', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
    process.env.CLOUDINARY_CLINICAL_FOLDER = 'carait-clinic/clinical'
    process.env.CLOUDINARY_PAYMENT_FOLDER = 'carait-clinic/payment-qr'
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the API secret on the server and requests Perception Point for clinical uploads', () => {
    const result = createClinicalUploadSignature({ doctorId: 4, appointmentId: 19 })
    expect(result.cloud_name).toBe('test-cloud')
    expect(result.api_key).toBe('test-key')
    expect(result.folder).toContain('doctor-4/appointment-19')
    expect(result.moderation).toBe('perception_point')
    expect(result.scan_mode).toBe('scan')
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/)
    expect(result.api_secret).toBeUndefined()
  })

  it('can authorize an explicitly confirmed clinical bypass without Perception Point', () => {
    const result = createClinicalUploadSignature({ doctorId: 4, appointmentId: 19, scanMode: 'bypass' })
    expect(result.scan_mode).toBe('bypass')
    expect(result.moderation).toBeUndefined()
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/)
  })

  it('creates a unique quarantined payment QR destination and requests malware scanning', () => {
    const result = createPaymentQrUploadSignature({ adminId: 1, provider: 'gcash' })
    expect(result.folder).toBe('carait-clinic/payment-qr/admin-1')
    expect(result.public_id).toMatch(/^gcash-qr-\d+$/)
    expect(result.moderation).toBe('perception_point')
    expect(result.scan_mode).toBe('scan')
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/)
    expect(result.api_secret).toBeUndefined()
  })

  it('rejects unknown payment QR providers', () => {
    expect(() => createPaymentQrUploadSignature({ adminId: 1, provider: 'other' })).toThrow(/GCash or Maya/)
  })

  it('produces deterministic Cloudinary signatures for the same canonical parameters', () => {
    expect(makeCloudinarySignature({ timestamp: 123, folder: 'a/b', moderation: 'perception_point' }, 'secret'))
      .toBe(makeCloudinarySignature({ moderation: 'perception_point', folder: 'a/b', timestamp: 123 }, 'secret'))
  })

  it('extracts Perception Point moderation from a Cloudinary resource', () => {
    expect(findPerceptionPointModeration({ moderation: [{ kind: 'perception_point', status: 'approved' }] }))
      .toEqual({ kind: 'perception_point', status: 'approved' })
  })

  it('queries Cloudinary Admin API without exposing the secret and returns approved scan status', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        asset_id: 'asset-123',
        public_id: 'carait-clinic/clinical/doctor-4/image',
        secure_url: 'https://res.cloudinary.com/test/image/upload/image.png',
        moderation: [{ kind: 'perception_point', status: 'approved' }],
      }),
    })

    const result = await getPerceptionPointScanStatus('asset-123')
    expect(result.status).toBe('approved')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toMatch(/^Basic /)
    expect(options.headers.Authorization).not.toContain('test-secret')
  })

  it('recognizes add-on quota/provider errors as scanner unavailable', () => {
    expect(isScannerUnavailableCloudinaryError({ status: 400, message: 'Perception Point add-on usage limit reached' })).toBe(true)
    expect(isScannerUnavailableCloudinaryError({ status: 429, message: 'Rate limited' })).toBe(true)
    expect(isScannerUnavailableCloudinaryError({ status: 400, message: 'Invalid image format' })).toBe(false)
  })

  it('classifies an HTTP 400 Perception Point usage-limit response as scanner unavailable', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Perception Point add-on usage limit reached' } }),
    })

    await expect(getPerceptionPointScanStatus('asset-quota')).rejects.toMatchObject({
      scannerUnavailable: true,
      scannerReason: 'usage_limit_reached',
      providerStatus: 400,
    })
    expect(getScannerUnavailableReason({ status: 400, message: 'Perception Point add-on usage limit reached' })).toBe('usage_limit_reached')
  })

  it('binds accepted upload security proof to the authenticated user, context, URL and scan status', () => {
    const token = issueAcceptedUploadToken({
      role: 'doctor', userId: 7, contextType: 'clinical', contextId: 31,
      status: 'approved', assetId: 'asset-31', url: 'https://res.cloudinary.com/test/image/upload/clinical.png', publicId: 'clinical.png',
    })
    const verified = verifyUploadSecurityToken(token, {
      stage: 'accepted', role: 'doctor', user_id: 7, context_type: 'clinical', context_id: 31,
      url: 'https://res.cloudinary.com/test/image/upload/clinical.png',
    })
    expect(verified.scan_status).toBe('approved')
    expect(() => verifyUploadSecurityToken(token, { context_id: 99 })).toThrow(/does not match/i)
  })

  it('issues bypass authorization separately from accepted upload proof', () => {
    const bypass = issueBypassAuthorizationToken({
      role: 'admin', userId: 1, contextType: 'payment_qr', contextId: 'gcash', reason: 'scanner_unavailable',
    })
    expect(verifyUploadSecurityToken(bypass, {
      stage: 'bypass_authorized', role: 'admin', user_id: 1, context_type: 'payment_qr', context_id: 'gcash',
    }).reason).toBe('scanner_unavailable')
    expect(() => verifyUploadSecurityToken(bypass, { stage: 'accepted' })).toThrow(/does not match/i)
  })

})
