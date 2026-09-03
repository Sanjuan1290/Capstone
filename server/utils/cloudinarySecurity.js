const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const SCAN_MODERATION = 'perception_point'
const SCAN_STATUSES = new Set(['pending', 'approved', 'rejected'])
const SECURITY_TOKEN_PURPOSE = 'cloudinary_upload_security'
const SECURITY_TOKEN_ISSUER = 'carait-clinic'

const requireCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error('Signed image uploads are not configured.'), { statusCode: 503, scannerUnavailable: true })
  }
  return { cloudName, apiKey, apiSecret }
}

const getSecurityTokenSecret = () => {
  const { apiSecret } = requireCloudinaryConfig()
  return process.env.JWT_SECRET || apiSecret
}

const makeCloudinarySignature = (params, apiSecret) => {
  const canonical = Object.keys(params)
    .sort()
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex')
}

const normalizeScanMode = (scanMode) => (String(scanMode || '').toLowerCase() === 'bypass' ? 'bypass' : 'scan')

const withScanModeration = (params, scanMode) => {
  if (normalizeScanMode(scanMode) === 'scan') return { ...params, moderation: SCAN_MODERATION }
  return params
}

const createClinicalUploadSignature = ({ doctorId, appointmentId, scanMode = 'scan' }) => {
  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const baseFolder = String(process.env.CLOUDINARY_CLINICAL_FOLDER || 'carait-clinic/clinical').replace(/^\/+|\/+$/g, '')
  const folder = `${baseFolder}/doctor-${Number(doctorId)}/appointment-${Number(appointmentId)}`
  const normalizedScanMode = normalizeScanMode(scanMode)
  const params = withScanModeration({ folder, timestamp }, normalizedScanMode)
  return {
    cloud_name: cloudName,
    api_key: apiKey,
    timestamp,
    folder,
    moderation: params.moderation,
    scan_mode: normalizedScanMode,
    signature: makeCloudinarySignature(params, apiSecret),
  }
}

const createPaymentQrUploadSignature = ({ adminId, provider, scanMode = 'scan' }) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  if (!['gcash', 'maya'].includes(normalizedProvider)) {
    throw Object.assign(new Error('Payment QR provider must be GCash or Maya.'), { statusCode: 400 })
  }

  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const baseFolder = String(process.env.CLOUDINARY_PAYMENT_FOLDER || 'carait-clinic/payment-qr').replace(/^\/+|\/+$/g, '')
  const folder = `${baseFolder}/admin-${Number(adminId)}`
  const publicId = `${normalizedProvider}-qr-${timestamp}`
  const normalizedScanMode = normalizeScanMode(scanMode)
  const params = withScanModeration({ folder, public_id: publicId, timestamp }, normalizedScanMode)

  return {
    cloud_name: cloudName,
    api_key: apiKey,
    timestamp,
    folder,
    public_id: publicId,
    moderation: params.moderation,
    scan_mode: normalizedScanMode,
    signature: makeCloudinarySignature(params, apiSecret),
  }
}

const findPerceptionPointModeration = (resource = {}) => {
  const moderationList = Array.isArray(resource.moderation)
    ? resource.moderation
    : Array.isArray(resource.moderations)
      ? resource.moderations
      : resource.moderation && typeof resource.moderation === 'object'
        ? [resource.moderation]
        : []
  return moderationList.find((item) => String(item?.kind || '').toLowerCase() === SCAN_MODERATION) || null
}

const scannerUsageLimitReached = (message = '') => (
  /quota|usage (?:allowance|limit)|limit of .*operations reached|operations reached|add[ -]?on .*limit|usage limit/i.test(String(message))
)

const isScannerUnavailableCloudinaryError = ({ status, message } = {}) => {
  const text = String(message || '').toLowerCase()
  if ([420, 429].includes(Number(status)) || Number(status) >= 500) return true
  return /perception[ _-]?point|malware|moderation|add[ -]?on|quota|usage|limit|not (?:enabled|registered|available)|subscription/.test(text)
}

const getScannerUnavailableReason = ({ status, message } = {}) => {
  if (scannerUsageLimitReached(message)) return 'usage_limit_reached'
  return isScannerUnavailableCloudinaryError({ status, message }) ? 'scanner_unavailable' : null
}

const cloudinaryAdminRequest = async (assetId) => {
  if (!assetId) throw Object.assign(new Error('Cloudinary asset ID is required.'), { statusCode: 400 })
  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig()
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/${encodeURIComponent(String(assetId))}?moderations=true`

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })
  } catch (error) {
    throw Object.assign(new Error('Cloudinary security scan status is temporarily unavailable.'), {
      statusCode: 503,
      scannerUnavailable: true,
      scannerReason: 'scanner_unavailable',
      cause: error,
    })
  }

  let data = {}
  try { data = await response.json() } catch { data = {} }

  if (!response.ok) {
    const providerMessage = String(data?.error?.message || data?.message || '').trim()
    const scannerReason = getScannerUnavailableReason({ status: response.status, message: providerMessage })
    const unavailable = Boolean(scannerReason)
    throw Object.assign(new Error(providerMessage || (unavailable
      ? 'Cloudinary security scan status is temporarily unavailable.'
      : 'Could not read the uploaded asset security status.')), {
      statusCode: unavailable ? 503 : response.status,
      scannerUnavailable: unavailable,
      scannerReason: scannerReason || undefined,
      providerStatus: response.status,
    })
  }

  return data
}

const getPerceptionPointScanStatus = async (assetId) => {
  const resource = await cloudinaryAdminRequest(assetId)
  const moderation = findPerceptionPointModeration(resource)
  if (!moderation) {
    return {
      status: 'unavailable',
      reason: 'moderation_missing',
      message: 'Perception Point did not return a malware scan status for this image.',
      asset_id: resource.asset_id || assetId,
      public_id: resource.public_id || null,
      secure_url: resource.secure_url || null,
    }
  }

  const status = String(moderation.status || '').toLowerCase()
  if (!SCAN_STATUSES.has(status)) {
    return {
      status: 'unavailable',
      reason: 'unknown_status',
      message: 'The malware scanner returned an unknown status.',
      asset_id: resource.asset_id || assetId,
      public_id: resource.public_id || null,
      secure_url: resource.secure_url || null,
    }
  }

  return {
    status,
    moderation_kind: SCAN_MODERATION,
    asset_id: resource.asset_id || assetId,
    public_id: resource.public_id || null,
    secure_url: resource.secure_url || null,
  }
}

const hasValidImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
  const mime = String(mimeType || '').toLowerCase()
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

const cloudinaryUploadBuffer = async ({ buffer, mimeType, fileName, signed }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('Select an image to upload.'), { statusCode: 400 })
  }
  const safeMime = String(mimeType || '').toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(safeMime)) {
    throw Object.assign(new Error('Image must be PNG, JPG, or WEBP.'), { statusCode: 400 })
  }
  if (!hasValidImageSignature(buffer, safeMime)) {
    throw Object.assign(new Error('The uploaded file content does not match a valid PNG, JPG, or WEBP image.'), { statusCode: 400 })
  }

  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: safeMime }), String(fileName || 'upload-image').replace(/[\r\n"]/g, '_'))
  formData.append('api_key', signed.api_key)
  formData.append('timestamp', String(signed.timestamp))
  if (signed.folder) formData.append('folder', signed.folder)
  if (signed.public_id) formData.append('public_id', signed.public_id)
  if (signed.moderation) formData.append('moderation', signed.moderation)
  formData.append('signature', signed.signature)

  let response
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloud_name}/image/upload`, {
      method: 'POST',
      body: formData,
    })
  } catch (error) {
    throw Object.assign(new Error('The image upload could not reach Cloudinary. Check the connection and try again.'), {
      statusCode: 503,
      providerUnavailable: true,
      cause: error,
    })
  }

  let data = {}
  try { data = await response.json() } catch { data = {} }
  if (!response.ok) {
    const providerMessage = String(data?.error?.message || data?.message || 'Image upload failed.').trim()
    const scannerReason = signed.scan_mode === 'scan'
      ? getScannerUnavailableReason({ status: response.status, message: providerMessage })
      : null
    throw Object.assign(new Error(providerMessage), {
      statusCode: scannerReason ? 503 : (response.status || 502),
      scannerUnavailable: Boolean(scannerReason),
      scannerReason: scannerReason || undefined,
      providerStatus: response.status,
    })
  }
  if (!data.secure_url || !data.asset_id) {
    throw Object.assign(new Error('Cloudinary did not return a complete uploaded asset.'), { statusCode: 502 })
  }
  return data
}

const issueUploadSecurityToken = (claims, expiresIn = '45m') => jwt.sign({
  purpose: SECURITY_TOKEN_PURPOSE,
  ...claims,
}, getSecurityTokenSecret(), {
  expiresIn,
  issuer: SECURITY_TOKEN_ISSUER,
  audience: 'carait-clinic-upload',
})

const verifyUploadSecurityToken = (token, expected = {}) => {
  if (!token) throw Object.assign(new Error('Upload security verification is required.'), { statusCode: 400, code: 'UPLOAD_SECURITY_TOKEN_REQUIRED' })
  let decoded
  try {
    decoded = jwt.verify(String(token), getSecurityTokenSecret(), {
      issuer: SECURITY_TOKEN_ISSUER,
      audience: 'carait-clinic-upload',
    })
  } catch {
    throw Object.assign(new Error('Upload security verification is invalid or expired. Upload the image again.'), { statusCode: 400, code: 'UPLOAD_SECURITY_TOKEN_INVALID' })
  }
  if (decoded.purpose !== SECURITY_TOKEN_PURPOSE) {
    throw Object.assign(new Error('Upload security verification is invalid.'), { statusCode: 400 })
  }
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined || value === null) continue
    if (String(decoded[key]) !== String(value)) {
      throw Object.assign(new Error('Upload security verification does not match this image or user.'), { statusCode: 403, code: 'UPLOAD_SECURITY_TOKEN_MISMATCH' })
    }
  }
  return decoded
}

const hashUploadBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const issueScanPendingToken = ({ role, userId, contextType, contextId, assetId, url, publicId, fileHash }) => issueUploadSecurityToken({
  stage: 'scan_pending',
  role,
  user_id: Number(userId),
  context_type: contextType,
  context_id: String(contextId),
  asset_id: String(assetId),
  url: String(url),
  public_id: publicId ? String(publicId) : null,
  file_sha256: fileHash ? String(fileHash) : null,
}, '20m')

const issueBypassAuthorizationToken = ({ role, userId, contextType, contextId, reason, fileHash }) => issueUploadSecurityToken({
  stage: 'bypass_authorized',
  role,
  user_id: Number(userId),
  context_type: contextType,
  context_id: String(contextId),
  reason: reason === 'usage_limit_reached' ? 'usage_limit_reached' : 'scanner_unavailable',
  file_sha256: fileHash ? String(fileHash) : null,
}, '5m')

const issueAcceptedUploadToken = ({ role, userId, contextType, contextId, status, assetId, url, publicId }) => issueUploadSecurityToken({
  stage: 'accepted',
  role,
  user_id: Number(userId),
  context_type: contextType,
  context_id: String(contextId),
  scan_status: status === 'bypassed' ? 'bypassed' : 'approved',
  asset_id: String(assetId || ''),
  url: String(url || ''),
  public_id: publicId ? String(publicId) : null,
}, '2h')

module.exports = {
  SCAN_MODERATION,
  createClinicalUploadSignature,
  createPaymentQrUploadSignature,
  makeCloudinarySignature,
  getPerceptionPointScanStatus,
  findPerceptionPointModeration,
  isScannerUnavailableCloudinaryError,
  getScannerUnavailableReason,
  cloudinaryUploadBuffer,
  issueScanPendingToken,
  issueBypassAuthorizationToken,
  issueAcceptedUploadToken,
  verifyUploadSecurityToken,
  hashUploadBuffer,
  hasValidImageSignature,
}
