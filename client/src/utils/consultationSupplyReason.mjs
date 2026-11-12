// Consultation-specific supply usage stays separate from Services & Pricing defaults.
// Supply-change reasons are optional. If entered, they must be 5–255 characters.
const isExtra = (material) => material?.consultation_extra === true || Number(material?.consultation_extra || 0) === 1

export function supplyReasonStatus(service = {}, _catalogService = null) {
  const required = false
  const reason = String(service?.usage_change_reason || '').trim()
  return { required, valid: reason.length === 0 || (reason.length >= 5 && reason.length <= 255), remaining: reason ? Math.max(0, 5 - reason.length) : 0 }
}

const parseDetails = (raw) => {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

export function restoreConsultationServicesFromBilling(items = []) {
  const rows = Array.isArray(items) ? items : []
  const services = rows.filter((item) => item?.item_type === 'service').map((item) => {
    const details = parseDetails(item.details_json ?? item.details)
    return {
      catalog_service_id: item.catalog_service_id,
      service_name: item.service_name,
      quantity: Number(item.quantity || 1),
      materials: Array.isArray(details.materials) ? [...details.materials] : [],
      usage_change_reason: details.usage_change_reason || '',
      partial_service_note: details.partial_service_note || '',
      ...(details.requested_promotion_id !== null && details.requested_promotion_id !== undefined ? {promotion_id:details.requested_promotion_id} : {}),
      usage_overridden: Boolean(details.usage_overridden),
    }
  })
  for (const item of rows) {
    if (item?.item_type !== 'supply' || item?.source_type !== 'consultation_extra') continue
    const details = parseDetails(item.details_json ?? item.details)
    const parentId = Number(item.catalog_service_id || details.parent_catalog_service_id || 0)
    const parent = services.find((service) => Number(service.catalog_service_id) === parentId)
      || (services.length === 1 ? services[0] : null)
    const inventoryId = Number(item.source_inventory_id || details.inventory_id || 0)
    if (!parent || inventoryId <= 0 || Number(item.quantity) <= 0) continue
    if (parent.materials.some((m) => isExtra(m) && Number(m.inventory_id) === inventoryId)) continue
    parent.materials.push({
      inventory_id: inventoryId,
      material_name: item.service_name || details.inventory_name || 'Extra Consumable',
      quantity: Number(item.quantity),
      unit_label: details.unit || item.unit_label || 'unit',
      consultation_extra: true,
    })
  }
  return services
}

