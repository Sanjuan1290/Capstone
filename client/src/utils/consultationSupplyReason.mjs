// Consultation-specific supply usage stays separate from Services & Pricing defaults.
// Drafts may have missing reasons; completion must not.
const isExtra = (material) => material?.consultation_extra === true || Number(material?.consultation_extra || 0) === 1

export function supplyReasonStatus(service = {}, catalogService = null) {
  const materials = Array.isArray(service?.materials) ? service.materials : []
  const extras = materials.some(isExtra)
  const changedFromSnapshot = service?.usage_overridden === true || Number(service?.usage_overridden || 0) === 1
  let changedFromCatalog = false
  if (catalogService && Array.isArray(catalogService.materials)) {
    const expected = new Map(catalogService.materials
      .filter((m) => Number(m.inventory_id) > 0 && Number(m.quantity) > 0)
      .map((m) => [Number(m.inventory_id), Number(m.quantity)]))
    const actual = new Map(materials.filter((m) => !isExtra(m))
      .map((m) => [Number(m.inventory_id), Number(m.quantity)]))
    changedFromCatalog = expected.size !== actual.size || [...expected].some(([id, qty]) => actual.get(id) !== qty)
  }
  const required = extras || changedFromSnapshot || changedFromCatalog
  const reason = String(service?.usage_change_reason || '').trim()
  return { required, valid: !required || (reason.length >= 5 && reason.length <= 255), remaining: Math.max(0, 5 - reason.length) }
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
