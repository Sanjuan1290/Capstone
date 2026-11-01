// Public pricing is opt-in: a catalog amount alone is not approval to advertise it.
export function publicServicePrice(service) {
  const approved = service?.public_price_visible === true || service?.show_public_price === true || service?.public_price_visible === 1
  const amount = Number(service?.default_price)
  return approved && Number.isFinite(amount) && amount > 0 ? amount : null
}
export function listServicesForCategory(services, category) {
  return (Array.isArray(services) ? services : []).filter(service =>
    category === 'all' || service.clinic_type === category || service.clinic_type === 'all'
  )
}
