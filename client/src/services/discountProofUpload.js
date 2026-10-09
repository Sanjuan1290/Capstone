import { makeSecurityScanError, waitForSecurityScan } from './cloudinaryScan'

const readJson = async (response) => {
  let data = {}
  try { data = await response.json() } catch { data = {} }
  if (!response.ok) {
    const error = new Error(data.message || 'Discount proof upload failed.')
    Object.assign(error, data)
    throw error
  }
  return data
}

export const uploadDiscountProofViaApi = async ({
  file,
  billingId,
  uploadUrl,
  statusUrl,
  scanMode = 'scan',
  bypassToken = '',
  onStatus,
}) => {
  if (!file) throw new Error('Select a reference / ID proof image to upload.')
  if (!['image/png', 'image/jpeg'].includes(String(file.type || '').toLowerCase())) {
    throw new Error('Discount proof must be a PNG or JPG image.')
  }
  if (Number(file.size || 0) > 5 * 1024 * 1024) throw new Error('Discount proof image must be 5 MB or smaller.')
  if (!billingId) throw new Error('A valid billing record is required before uploading discount proof.')

  const params = new URLSearchParams({ billing_id: String(billingId), scan_mode: scanMode })
  if (bypassToken) params.set('bypass_token', bypassToken)
  onStatus?.({ phase: 'uploading', tone: 'info', message: scanMode === 'bypass' ? 'Uploading trusted proof without malware scanning…' : 'Uploading proof securely…' })
  const uploadResponse = await fetch(`${uploadUrl}?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type, 'X-File-Name': file.name || 'discount-proof' },
    body: file,
  })
  const uploaded = await readJson(uploadResponse)

  if (uploaded.status === 'unavailable') {
    const limitReached = uploaded.reason === 'usage_limit_reached'
    throw makeSecurityScanError(
      limitReached ? 'SCAN_LIMIT_REACHED' : 'SCAN_UNAVAILABLE',
      uploaded.message || 'The malware scanner is currently unavailable.',
      { reason: uploaded.reason, bypass_token: uploaded.bypass_token }
    )
  }
  if (scanMode === 'bypass' || uploaded.status === 'bypassed') {
    onStatus?.({ phase: 'bypassed', tone: 'warning', message: 'Uploaded without malware scanning.' })
    return uploaded
  }
  if (!uploaded.asset_id || !uploaded.scan_token) throw new Error('The server did not return scan verification for this upload.')

  try {
    const scan = await waitForSecurityScan(async () => {
      const response = await fetch(statusUrl, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_id: Number(billingId), asset_id: uploaded.asset_id, scan_token: uploaded.scan_token }),
      })
      return readJson(response)
    }, { onStatus })
    return {
      url: scan.secure_url || uploaded.url,
      scan_status: 'approved',
      asset_id: uploaded.asset_id,
      public_id: scan.public_id || uploaded.public_id,
      security_token: scan.security_token,
      scan_token: uploaded.scan_token,
    }
  } catch (error) {
    error.asset_id = uploaded.asset_id
    error.public_id = uploaded.public_id
    error.url = uploaded.url
    error.scan_token = uploaded.scan_token
    throw error
  }
}

