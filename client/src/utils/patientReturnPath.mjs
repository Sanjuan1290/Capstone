// Permit only in-app patient URLs after authentication. No protocol-relative URLs,
// backslashes, fragments, authentication screens, or foreign destinations.
export const patientReturnPath = (candidate) => {
  const value = String(candidate || '')
  if (value.length > 700 || !/^\/patient\/(?:book|appointments)(?:\?|$)/.test(value) || value.includes('\\') || value.includes('#')) return '/patient'
  const path = value.split('?')[0]
  if (path !== '/patient/book' && path !== '/patient/appointments') return '/patient'
  if (path === '/patient/appointments') return '/patient/appointments'
  const params = new URLSearchParams(value.split('?')[1] || '')
  const clean = new URLSearchParams()
  for (const key of ['branch_id','doctor','service_id']) {
    const item = params.get(key)
    if (item && /^\d{1,9}$/.test(item) && Number(item) > 0) clean.set(key,item)
  }
  const clinic = params.get('clinic')
  if (clinic === 'medical' || clinic === 'derma') clean.set('clinic',clinic)
  const suffix = clean.toString()
  return `/patient/book${suffix?`?${suffix}`:''}`
}
