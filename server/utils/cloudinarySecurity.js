const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const SECURITY_TOKEN_PURPOSE = 'cloudinary_upload_security'
const SECURITY_TOKEN_ISSUER = 'carait-clinic'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const requireCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error('Signed image uploads are not configured. Add the Cloudinary server credentials and restart the server.'), { statusCode: 503, code: 'CLINICAL_IMAGE_UPLOAD_NOT_CONFIGURED', providerUnavailable: true })
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


const createImageUploadSignature = ({folder,publicId=null}) => {
 const {cloudName,apiKey,apiSecret}=requireCloudinaryConfig(),timestamp=Math.floor(Date.now()/1000)
 const params={folder,timestamp,...(publicId?{public_id:publicId}:{})}
 return {cloud_name:cloudName,api_key:apiKey,...params,signature:makeCloudinarySignature(params,apiSecret)}
}
const createClinicalUploadSignature = ({doctorId,appointmentId,patientId,clinicType,branchId}) => createImageUploadSignature({folder:`${process.env.CLOUDINARY_CLINICAL_FOLDER||'carait-clinic/clinical'}/branch_${Number(branchId)}/${clinicType==='derma'?'derma':'medical'}/patient_${Number(patientId)||Number(doctorId)}/appointment_${Number(appointmentId)}`})
const createPaymentQrUploadSignature = ({actorId,adminId,actorRole='admin',provider,branchId}) => {
 if(!['gcash','maya'].includes(provider))throw Object.assign(new Error('QR provider must be GCash or Maya.'),{statusCode:400})
 return createImageUploadSignature({folder:`${process.env.CLOUDINARY_PAYMENT_QR_FOLDER||process.env.CLOUDINARY_PAYMENT_FOLDER||'carait-clinic/payment-qr'}/branch_${Number(branchId)}/${actorRole}_${Number(actorId??adminId)}`,publicId:`${provider}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`})
}
const createDiscountProofUploadSignature = ({actorId,actorRole='admin',billingId,branchId}) => createImageUploadSignature({folder:`${process.env.CLOUDINARY_DISCOUNT_PROOF_FOLDER||'carait-clinic/discount-proofs'}/branch_${Number(branchId)}/bill_${Number(billingId)}/${actorRole}_${Number(actorId)}`})

const hasValidImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
  const mime = String(mimeType || '').toLowerCase()
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    return false
}

const detectImageMime = (buffer) => {
  for (const mime of ['image/png','image/jpeg']) {
    if (hasValidImageSignature(buffer, mime)) return mime
  }
  return null
}


const cloudinaryUploadBuffer = async ({buffer,mimeType,fileName,signed,maxBytes=MAX_IMAGE_BYTES}) => {
 if(!Buffer.isBuffer(buffer)||!buffer.length)throw Object.assign(new Error('Select a PNG or JPG image.'),{statusCode:400})
 if(buffer.length>maxBytes)throw Object.assign(new Error(`Image must be ${maxBytes/1024/1024} MB or smaller.`),{statusCode:413})
 const detected=detectImageMime(buffer),declared=String(mimeType||'').toLowerCase().split(';')[0].trim()
 if(!detected||declared&&!['image/png','image/jpeg','application/octet-stream'].includes(declared))throw Object.assign(new Error('The file must be a valid PNG or JPG image.'),{statusCode:400})
 const formData=new FormData()
 formData.append('file',new Blob([buffer],{type:detected}),String(fileName||'image').replace(/[\r\n"]/g,'_'))
 for(const key of ['api_key','timestamp','folder','public_id','signature'])if(signed[key]!=null)formData.append(key,String(signed[key]))
 let response
 try{response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloud_name)}/image/upload`,{method:'POST',body:formData,signal:AbortSignal.timeout(30000)})}
 catch(error){throw Object.assign(new Error('The image upload could not reach Cloudinary. Try again.'),{statusCode:503,providerUnavailable:true,cause:error})}
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Object.assign(new Error(data.error?.message||'Cloudinary image upload failed.'),{statusCode:response.status===413?413:502,providerStatus:response.status})
 let uri;try{uri=new URL(data.secure_url)}catch{}
 if(!data.asset_id||!uri||uri.protocol!=='https:'||uri.hostname!=='res.cloudinary.com'||!uri.pathname.startsWith(`/${signed.cloud_name}/image/upload/`)||data.bytes>maxBytes||data.resource_type&&data.resource_type!=='image')throw Object.assign(new Error('Cloudinary did not return a valid uploaded image.'),{statusCode:502})
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


const issueAcceptedUploadToken = ({role,userId,contextType,contextId,branchId,assetId,url,publicId}) => issueUploadSecurityToken({stage:'accepted',validation:'image_validated',role,user_id:Number(userId),branch_id:Number(branchId),context_type:contextType,context_id:String(contextId),asset_id:String(assetId||''),url:String(url||''),public_id:publicId?String(publicId):null},'2h')
module.exports={createImageUploadSignature,createClinicalUploadSignature,createPaymentQrUploadSignature,createDiscountProofUploadSignature,makeCloudinarySignature,cloudinaryUploadBuffer,issueAcceptedUploadToken,verifyUploadSecurityToken,hasValidImageSignature,detectImageMime,MAX_IMAGE_BYTES}
