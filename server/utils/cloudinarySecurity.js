const crypto = require('crypto')

const requireCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error('Signed clinical image uploads are not configured.'), { statusCode: 503 })
  }
  return { cloudName, apiKey, apiSecret }
}

const makeCloudinarySignature = (params, apiSecret) => {
  const canonical = Object.keys(params)
    .sort()
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex')
}

const createClinicalUploadSignature = ({ doctorId, appointmentId }) => {
  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const baseFolder = String(process.env.CLOUDINARY_CLINICAL_FOLDER || 'carait-clinic/clinical').replace(/^\/+|\/+$/g, '')
  const folder = `${baseFolder}/doctor-${Number(doctorId)}/appointment-${Number(appointmentId)}`
  const params = { folder, timestamp }
  return {
    cloud_name: cloudName,
    api_key: apiKey,
    timestamp,
    folder,
    signature: makeCloudinarySignature(params, apiSecret),
  }
}

module.exports = { createClinicalUploadSignature, makeCloudinarySignature }
