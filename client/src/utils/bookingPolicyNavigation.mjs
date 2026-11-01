import { patientReturnPath } from './patientReturnPath.mjs'

const addPositiveId = (params, key, value) => {
  const normalized = String(value ?? '')
  if (/^[1-9]\d{0,8}$/.test(normalized)) params.set(key, normalized)
}

export const buildBookingPolicyUrl = ({ branchId, clinicType, serviceId, doctorId } = {}) => {
  const params = new URLSearchParams()
  addPositiveId(params, 'branch_id', branchId)
  if (clinicType === 'medical' || clinicType === 'derma') params.set('clinic', clinicType)
  addPositiveId(params, 'service_id', serviceId)
  addPositiveId(params, 'doctor', doctorId)
  const query = params.toString()
  return `/booking-policy${query ? `?${query}` : ''}`
}

export const buildPatientBookingUrl = (searchParams) => {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams || '')
  return patientReturnPath(`/patient/book?${params.toString()}`)
}

export const changePolicyBranch = (searchParams, branchId) => {
  const next = new URLSearchParams(searchParams)
  const previousBranchId = next.get('branch_id') || ''
  const nextBranchId = String(branchId || '')

  if (nextBranchId && /^[1-9]\d{0,8}$/.test(nextBranchId)) next.set('branch_id', nextBranchId)
  else next.delete('branch_id')

  // Service and doctor IDs belong to a specific branch. Keep the clinic category,
  // but discard branch-specific selections when the visitor changes branches.
  if (nextBranchId !== previousBranchId) {
    next.delete('service_id')
    next.delete('doctor')
  }
  return next
}
