// Only preselect a service when the offer has exactly one eligible, active,
// branch-matching service. Multiple eligible services remain a patient choice.
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null

export function promotionBookingPath(promotion, directory = null) {
  const branchId = positiveId(promotion?.branch_id)
  if (!branchId) return '/patient/book'
  const params = new URLSearchParams({ branch_id: String(branchId) })
  const promotionId = positiveId(promotion?.id)
  if (promotionId) params.set('promotion_id', String(promotionId))
  const services = Array.isArray(promotion?.service_ids) ? [...new Set(promotion.service_ids.map(positiveId).filter(Boolean))] : []
  if (services.length === 1 && Array.isArray(directory?.services)) {
    const matched = directory.services.find(s => Number(s.id) === services[0] && Number(s.branch_id) === branchId && ['medical','derma'].includes(s.clinic_type))
    if (matched) {
      params.set('clinic', matched.clinic_type)
      params.set('service_id', String(matched.id))
    }
  }
  return `/patient/book?${params.toString()}`
}
