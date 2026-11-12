const { verifySessionToken } = require('./sessionSecurity')

// SMS ownership proves a guest phone, never a registered portal account.
const canViewPatientPromotions = async req => {
  if (!req.cookies?.patient_token) return false
  try {
    const user = await verifySessionToken(req.cookies.patient_token, 'patient')
    return user?.role === 'patient'
  } catch (error) {
    if ([401, 403].includes(error.statusCode) || ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return false
    throw error
  }
}
module.exports = { canViewPatientPromotions }
