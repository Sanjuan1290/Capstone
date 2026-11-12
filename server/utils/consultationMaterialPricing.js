// Compute patient-specific included-supply changes before saving a draft bill.
// The catalog total already includes its default supplies; apply the delta only.
const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const validUnitPrice = (product, id) => {
  const price = Number(product?.selling_price)
  if (!Number.isFinite(price) || price < 0) {
    throw Object.assign(new Error(`Cannot calculate service price: inventory item #${id} has no valid Selling Price.`), {statusCode:409,code:'INVENTORY_PRICE_UNAVAILABLE'})
  }
  return price
}
function repriceConsultationService({ catalogPrice, consultationFee = 0, defaults = [], actual = [], inventoryMap }) {
  const before = new Map()
  const after = new Map()
  for (const item of defaults) {
    const id = Number(item.inventory_id), quantity = Number(item.quantity)
    if (id > 0 && quantity > 0) before.set(id, (before.get(id) || 0) + quantity)
  }
  for (const item of actual) {
    const id = Number(item.inventory_id), quantity = Number(item.quantity)
    if (item.consultation_extra === true || Number(item.consultation_extra || 0) === 1) continue
    if (id > 0 && quantity > 0) after.set(id, (after.get(id) || 0) + quantity)
  }
  const adjustments = []
  let difference = 0
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const oldQuantity = before.get(id) || 0
    const newQuantity = after.get(id) || 0
    if (oldQuantity === newQuantity) continue
    const product = inventoryMap.get(id)
    if (!product) throw Object.assign(new Error(`Cannot calculate service price: linked inventory item #${id} is unavailable in this branch.`), {statusCode:409,code:'INVENTORY_PRICE_UNAVAILABLE'})
    const price = validUnitPrice(product,id)
    const change = money((newQuantity - oldQuantity) * price)
    difference = money(difference + change)
    adjustments.push({inventory_id:id,name:product.name || `Item #${id}`,before:oldQuantity,after:newQuantity,unit_price:price,price_change:change})
  }
  const base = Number(catalogPrice)
  const fee = Number(consultationFee)
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(fee) || fee < 0) {
    throw Object.assign(new Error('The service has invalid pricing configuration.'), {statusCode:409,code:'SERVICE_PRICE_REQUIRED'})
  }
  return {unitPrice:money(Math.max(fee,base+difference)),difference,adjustments,originalPrice:money(base)}
}
module.exports = {repriceConsultationService}
