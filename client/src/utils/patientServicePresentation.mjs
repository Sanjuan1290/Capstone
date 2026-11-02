// Show the server-approved total patient price on every public booking surface.
// A missing price must be labeled, not silently hidden or invented.
export function publicServicePrice(service) {
  const raw = service?.default_price ?? service?.patient_price
  if (raw === null || raw === undefined || raw === '') return null
  const amount = Number(raw)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}
export function formatPublicServicePrice(service) {
  const price = publicServicePrice(service)
  return price === null ? 'Price unavailable' : `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function listServicesForCategory(services, category) {
  return (Array.isArray(services) ? services : []).filter(service =>
    category === 'all' || service.clinic_type === category || service.clinic_type === 'all'
  )
}

