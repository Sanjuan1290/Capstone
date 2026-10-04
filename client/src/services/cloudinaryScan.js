const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

export const makeSecurityScanError = (code, message, details = {}) => {
  const error = new Error(message)
  error.code = code
  Object.assign(error, details)
  return error
}

export const waitForSecurityScan = async (checkStatus, { onStatus, attempts = 10, delayMs = 2000 } = {}) => {
  onStatus?.({ phase: 'scanning', tone: 'info', message: 'Security scan in progress…' })

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await checkStatus()
    const status = String(result?.status || '').toLowerCase()

    if (status === 'approved') {
      onStatus?.({ phase: 'approved', tone: 'success', message: 'Security scan passed.' })
      return result
    }
    if (status === 'rejected') {
      throw makeSecurityScanError('SCAN_REJECTED', 'Security scan failed. This image was identified as potentially unsafe and has been blocked.', result)
    }
    if (status === 'unavailable') {
      const limitReached = result?.reason === 'usage_limit_reached'
      throw makeSecurityScanError(
        limitReached ? 'SCAN_LIMIT_REACHED' : 'SCAN_UNAVAILABLE',
        result?.message || (limitReached
          ? 'The Perception Point malware-scanning usage limit has been reached.'
          : 'The malware scanner is currently unavailable. Its service or usage allowance may have been reached.'),
        result
      )
    }

    if (attempt < attempts - 1) await sleep(delayMs)
  }

  throw makeSecurityScanError(
    'SCAN_PENDING',
    'The security scan is taking longer than expected. The image has not been attached yet. Please check the same upload again shortly.'
  )
}
