import { supplyQuantityError } from './supplyQuantity.mjs'
// Display estimate only. The saved catalog price includes default supplies.
// Actual included usage changes that amount; extra supplies are billed once.
export function consultationPriceBreakdown(service, catalog, inventory = [], promotion = null) {
  if (!catalog) return null
  const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
  const servicePrice = Number(catalog.default_price)
  if (!Number.isFinite(servicePrice) || servicePrice < 0) return null
  const inv = new Map(inventory.map(item => [Number(item.id), item]))
  let supplies = 0
  const before = new Map()
  const after = new Map()
  for (const material of catalog.materials || []) {
    const id=Number(material.inventory_id)
    if (id>0) before.set(id,(before.get(id)||0)+Number(material.quantity||0))
  }
  for (const material of service?.materials || []) {
    const product = inv.get(Number(material.inventory_id))
    if (!product || supplyQuantityError(material.quantity,product)) return null
    if (!(material.consultation_extra === true || Number(material.consultation_extra || 0) === 1)) {
      const id=Number(material.inventory_id)
      after.set(id,(after.get(id)||0)+Number(material.quantity||0))
      continue
    }
    const price = Number(inv.get(Number(material.inventory_id))?.selling_price)
    const qty = Number(material.quantity)
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) return null
    supplies += money(price * qty)
  }
  let difference = 0
  for (const id of new Set([...before.keys(),...after.keys()])) {
    const quantityDifference = (after.get(id)||0)-(before.get(id)||0)
    if (!quantityDifference) continue
    const product=inv.get(id)
    if (!product || !Number.isFinite(Number(product.selling_price))) return null
    difference += money(quantityDifference*Number(product.selling_price))
  }
  const adjustedService = money(Math.max(Number(catalog.consultation_fee||0),servicePrice+difference))
  const savings = Math.min(adjustedService, Math.max(0, Number(promotion?.discount_amount ?? promotion?.promotion_discount_amount_snapshot ?? 0)))
  return { service: adjustedService, promotion: money(savings), supplies: money(supplies), total: money(adjustedService - savings + supplies), materialAdjustment:money(difference) }
}
export function estimateConsultationServicePrice(service, catalog, inventory = [], promotion = null) {
  return consultationPriceBreakdown(service, catalog, inventory, promotion)?.total ?? null
}

