import {uploadValidatedImage} from './imageUpload'

export const uploadDiscountProofViaApi = ({file,billingId,uploadUrl,onStatus}) => {
  if(!Number(billingId))throw new Error('A valid bill is required before uploading an image.')
  return uploadValidatedImage(file,`${uploadUrl}?${new URLSearchParams({billing_id:String(billingId)})}`,{onStatus})
}
