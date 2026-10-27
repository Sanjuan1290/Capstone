// Camera device labels vary by vendor; use active environment-facing device before any default front camera.
export const selectRearCamera = (devices = [], capturedId = '') => {
  const candidates = Array.isArray(devices) ? devices.filter(d => d?.deviceId) : []
  const rear = candidates.find(d => /\b(back|rear|environment|world|facing back)\b/i.test(d.label || '') && !/front|user|selfie/i.test(d.label || ''))
  return rear?.deviceId || (candidates.some(d => d.deviceId === capturedId) ? capturedId : '') || candidates.find(d => !/front|selfie|user/i.test(d.label || ''))?.deviceId || candidates[0]?.deviceId || ''
}

