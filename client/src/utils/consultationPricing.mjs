import { supplyQuantityError } from './supplyQuantity.mjs'
// Display estimate only. Included supplies are covered by the fixed service
// price; only explicitly added Extra Supplies change the patient charge.
export function consultationPriceBreakdown(service, catalog, inventory = [], promotion = null) {
  if (!catalog) return null
  const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
  const servicePrice = Number(catalog.default_price)
  if (!Number.isFinite(servicePrice) || servicePrice < 0) return null
  const inv = new Map(inventory.map(item => [Number(item.id), item]))
  let supplies = 0
  for (const material of service?.materials || []) {
    const product = inv.get(Number(material.inventory_id))
    if (!product || supplyQuantityError(material.quantity,product)) return null
    if (!(material.consultation_extra === true || Number(material.consultation_extra || 0) === 1)) continue
    const price = Number(inv.get(Number(material.inventory_id))?.selling_price)
    const qty = Number(material.quantity)
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) return null
    supplies += money(price * qty)
  }
  const savings = Math.min(servicePrice, Math.max(0, Number(promotion?.discount_amount ?? promotion?.promotion_discount_amount_snapshot ?? 0)))
  return { service: money(servicePrice), promotion: money(savings), supplies: money(supplies), total: money(servicePrice - savings + supplies) }
}
export function estimateConsultationServicePrice(service, catalog, inventory = [], promotion = null) {
  return consultationPriceBreakdown(service, catalog, inventory, promotion)?.total ?? null
}
