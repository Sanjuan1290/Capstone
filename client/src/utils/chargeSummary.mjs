// Display saved pricing snapshots, never current inventory/catalog prices.
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const detailsOf = item => {
  try { return typeof item.details === 'string' ? JSON.parse(item.details) : item.details || {} }
  catch { return {} }
}
export function chargeSummaryLines(items = []) {
  return items.map(item => {
    const details = detailsOf(item)
    const quantity = Number(item.quantity || 0)
    const includedItems = (Array.isArray(details.materials) ? details.materials : []).map(material => {
      const used = Number(material.quantity || 0)
      const price = material.charge_unit_price
      const knownTotal = price != null ? money(used * Number(price) * quantity)
        : Number(material.charge_quantity ?? used) === used && material.charge_total != null ? money(Number(material.charge_total) * quantity) : null
      return {
        name: material.material_name || material.inventory_name || 'Inventory item',
        quantity: used * quantity, unit: material.unit_label || '', total: knownTotal,
        included: !(material.consultation_extra === true || Number(material.consultation_extra) === 1),
      }
    })
    const total = money(quantity * Number(item.unit_price || 0))
    const included = includedItems.filter(material => material.included)
    const includedTotal = money(included.reduce((sum, material) => sum + Number(material.total || 0), 0))
    const servicePortion = included.length && included.every(material => material.total != null) && includedTotal <= total
      ? money(total - includedTotal) : null
    return {
      name: item.service_name || 'Charge', quantity, unitPrice: money(item.unit_price),
      total, includedItems, servicePortion,
      type: item.source_type === 'consultation' ? 'Service'
        : item.item_type === 'service' ? 'Additional service'
        : item.item_type === 'supply' || item.source_type === 'consultation_extra' ? 'Item / medicine' : 'Additional charge',
    }
  })
}
