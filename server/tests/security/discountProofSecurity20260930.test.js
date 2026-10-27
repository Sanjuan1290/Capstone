const { createDiscountProofUploadSignature, issueAcceptedUploadToken, verifyUploadSecurityToken } = require('../../utils/cloudinarySecurity')

describe('discount proof upload security', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-upload-security'
  })

  it('scopes the signed upload to the billing record and uploader', () => {
    const signed = createDiscountProofUploadSignature({ actorId: 5, actorRole: 'staff', billingId: 22 })
    expect(signed.folder).toContain('discount-proofs/bill_22/staff-5')
    expect(signed.public_id).toMatch(/^discount-proof-/)
    expect(signed.signature).toBeTruthy()
  })

  it('accepts proof only when token context, bill, user, and URL match', () => {
    const token = issueAcceptedUploadToken({
      role: 'staff', userId: 5, contextType: 'discount_proof', contextId: 22,
      status: 'approved', assetId: 'asset-22', url: 'https://res.cloudinary.com/test/image/upload/proof.jpg', publicId: 'proof',
    })
    expect(() => verifyUploadSecurityToken(token, {
      stage: 'accepted', role: 'staff', user_id: 5, context_type: 'discount_proof', context_id: 22,
      url: 'https://res.cloudinary.com/test/image/upload/proof.jpg',
    })).not.toThrow()
    expect(() => verifyUploadSecurityToken(token, {
      stage: 'accepted', role: 'staff', user_id: 5, context_type: 'discount_proof', context_id: 99,
    })).toThrow(/does not match/i)
  })
})

