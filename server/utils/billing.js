const db = require('../db/connect')

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const parseJsonSafe = (value, fallback = null) => {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const collectInventoryUsageFromBillingItems = (items = []) => {
  const usageMap = new Map()

  const addUsage = (inventoryId, quantity, label) => {
    const id = Number(inventoryId) || 0
    const qty = Math.max(0, Number(quantity) || 0)
    if (!id || qty <= 0) return

    const current = usageMap.get(id) || {
      inventory_id: id,
      quantity: 0,
      labels: new Set(),
    }
    current.quantity = roundMoney(current.quantity + qty)
    if (label) current.labels.add(label)
    usageMap.set(id, current)
  }

  for (const item of Array.isArray(items) ? items : []) {
    const itemQuantity = Math.max(0, Number(item.quantity) || 0)
    if (itemQuantity <= 0) continue

    if (item.item_type === 'supply') {
      addUsage(item.source_inventory_id, itemQuantity, item.service_name)
      continue
    }

    if (item.item_type === 'service') {
      const details = parseJsonSafe(item.details_json || item.details, null)
      const materials = Array.isArray(details?.materials) ? details.materials : []
      for (const material of materials) {
        addUsage(
          material.inventory_id,
          itemQuantity * (Number(material.quantity) || 0),
          `${item.service_name}: ${material.material_name}`
        )
      }
    }
  }

  return Array.from(usageMap.values()).map((entry) => ({
    inventory_id: entry.inventory_id,
    quantity: entry.quantity,
    labels: Array.from(entry.labels),
  }))
}

const normalizeServiceMaterials = (materials = []) => (
  Array.isArray(materials)
    ? materials
      .map((material, index) => {
        const quantity = Math.max(0, Number(material?.quantity) || 0)
        const inventoryId = Number(material?.inventory_id || material?.inventoryId || 0) || null
        const materialName = String(
          material?.material_name
          || material?.inventory_name
          || material?.name
          || ''
        ).trim()

        if (!materialName || quantity <= 0) return null

        return {
          inventory_id: inventoryId,
          material_name: materialName,
          quantity,
          unit_label: String(material?.unit_label || material?.unit || '').trim() || null,
          unit_cost_override: material?.unit_cost_override === '' || material?.unit_cost_override === null || material?.unit_cost_override === undefined
            ? null
            : Math.max(0, Number(material.unit_cost_override) || 0),
          notes: String(material?.notes || '').trim() || null,
          sort_order: Number.isFinite(Number(material?.sort_order)) ? Number(material.sort_order) : index,
        }
      })
      .filter(Boolean)
    : []
)

const computeCatalogServicePricing = (service = {}) => {
  const materials = Array.isArray(service.materials) ? service.materials : []
  const profitPercentage = Math.max(0, Number(service.profit_percentage) || 0)
  const consultationFee = Math.max(0, Number(service.consultation_fee) || 0)
  const materialsCost = roundMoney(materials.reduce((sum, material) => {
    const quantity = Math.max(0, Number(material?.quantity) || 0)
    const unitCost = material?.unit_cost_override !== null && material?.unit_cost_override !== undefined
      ? Math.max(0, Number(material.unit_cost_override) || 0)
      : Math.max(0, Number(material?.inventory_price) || 0)
    return sum + roundMoney(quantity * unitCost)
  }, 0))
  const billableBase = roundMoney(materialsCost + consultationFee)
  const profitAmount = roundMoney(billableBase * (profitPercentage / 100))
  const suggestedPrice = roundMoney(billableBase + profitAmount)

  return {
    ...service,
    materials_cost: materialsCost,
    consultation_fee: consultationFee,
    profit_percentage: profitPercentage,
    profit_amount: profitAmount,
    suggested_price: suggestedPrice,
    default_price: suggestedPrice,
  }
}

const hydrateBillingCatalogRows = async (serviceRows = [], executor = db) => {
  if (!Array.isArray(serviceRows) || serviceRows.length === 0) return []

  const serviceIds = serviceRows.map((row) => row.id)
  const placeholders = serviceIds.map(() => '?').join(', ')
  const [materialRows] = await executor.query(
    `SELECT
       m.id,
       m.billing_service_id,
       m.inventory_id,
       m.material_name,
       m.quantity,
       m.unit_label,
       m.unit_cost_override,
       m.notes,
       m.sort_order,
       i.name AS inventory_name,
       i.category AS inventory_category,
       i.unit AS inventory_unit,
       i.price AS inventory_price,
       i.stock AS inventory_stock
     FROM billing_service_materials m
     LEFT JOIN inventory i ON i.id = m.inventory_id
     WHERE m.billing_service_id IN (${placeholders})
     ORDER BY m.sort_order ASC, m.id ASC`,
    serviceIds
  )

  const materialsByServiceId = new Map()
  for (const row of materialRows) {
    const list = materialsByServiceId.get(row.billing_service_id) || []
    list.push({
      id: row.id,
      inventory_id: row.inventory_id,
      inventory_name: row.inventory_name || row.material_name,
      inventory_category: row.inventory_category || null,
      inventory_unit: row.inventory_unit || row.unit_label || null,
      inventory_price: Number(row.inventory_price) || 0,
      inventory_stock: Number(row.inventory_stock) || 0,
      material_name: row.material_name,
      quantity: Number(row.quantity) || 0,
      unit_label: row.unit_label || row.inventory_unit || null,
      unit_cost_override: row.unit_cost_override === null ? null : Number(row.unit_cost_override) || 0,
      notes: row.notes || null,
      sort_order: Number(row.sort_order) || 0,
    })
    materialsByServiceId.set(row.billing_service_id, list)
  }

  return serviceRows.map((row) => computeCatalogServicePricing({
    ...row,
    default_price: Number(row.default_price) || 0,
    consultation_fee: Number(row.consultation_fee) || 0,
    profit_percentage: Number(row.profit_percentage) || 0,
    materials: materialsByServiceId.get(row.id) || [],
  }))
}

const listBillingCatalog = async (options = {}, executor = db) => {
  const filters = []
  const params = []

  if (!options.includeInactive) {
    filters.push('is_active = 1')
  }

  if (options.clinicType) {
    filters.push('(clinic_type = ? OR clinic_type = "all")')
    params.push(options.clinicType)
  }

  if (Array.isArray(options.ids) && options.ids.length > 0) {
    filters.push(`id IN (${options.ids.map(() => '?').join(', ')})`)
    params.push(...options.ids)
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
  const [rows] = await executor.query(
    `SELECT id, category, service_name, clinic_type, default_price, consultation_fee, profit_percentage, is_active, sort_order
     FROM billing_service_catalog
     ${whereClause}
     ORDER BY sort_order ASC, category ASC, service_name ASC`,
    params
  )

  return hydrateBillingCatalogRows(rows, executor)
}

const getBillingCatalogServiceById = async (serviceId, executor = db) => {
  const rows = await listBillingCatalog({
    includeInactive: true,
    ids: [Number(serviceId)],
  }, executor)
  return rows[0] || null
}

const computeBillingTotals = ({ items = [], discount_amount = 0 }) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(item.line_total), 0))
  const discountAmount = Math.max(0, roundMoney(discount_amount))
  const totalAmount = Math.max(0, roundMoney(subtotal - discountAmount))

  return {
    subtotal,
    discount_amount: discountAmount,
    total_amount: totalAmount,
  }
}

const normalizeBillingItems = async (items = [], executor = db) => {
  const rawItems = Array.isArray(items) ? items : []
  const requestedServiceIds = Array.from(new Set(
    rawItems
      .filter((item) => itemTypeFromRaw(item) === 'service')
      .map((item) => Number(item?.catalog_service_id || item?.id || 0))
      .filter((value) => value > 0)
  ))

  const requestedInventoryIds = Array.from(new Set(
    rawItems
      .map((item) => Number(item?.source_inventory_id || item?.inventory_id || 0))
      .filter((value) => value > 0)
  ))

  const services = requestedServiceIds.length > 0
    ? await listBillingCatalog({ includeInactive: true, ids: requestedServiceIds }, executor)
    : []
  const serviceMap = new Map(services.map((service) => [service.id, service]))

  const inventoryMap = new Map()
  if (requestedInventoryIds.length > 0) {
    const [inventoryRows] = await executor.query(
      `SELECT id, name, category, unit, price
       FROM inventory
       WHERE id IN (${requestedInventoryIds.map(() => '?').join(', ')})`,
      requestedInventoryIds
    )
    inventoryRows.forEach((row) => inventoryMap.set(row.id, row))
  }

  return rawItems
    .map((item, index) => {
      const itemType = itemTypeFromRaw(item)
      const quantity = Math.max(0, Number(item?.quantity) || 0)
      if (quantity <= 0) return null

      const base = {
        notes: String(item?.notes || '').trim() || null,
        sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index,
      }

      if (itemType === 'service') {
        const serviceId = Number(item?.catalog_service_id || item?.id || 0)
        const service = serviceMap.get(serviceId)
        const fallbackName = String(item?.service_name || item?.name || '').trim()

        if (!service && !fallbackName) return null

        const serviceDetails = service
          ? {
              pricing: {
                materials_cost: service.materials_cost,
                consultation_fee: service.consultation_fee,
                profit_percentage: service.profit_percentage,
                profit_amount: service.profit_amount,
                suggested_price: service.suggested_price,
              },
              materials: service.materials.map((material) => ({
                inventory_id: material.inventory_id,
                material_name: material.material_name,
                quantity: material.quantity,
                unit_label: material.unit_label,
                unit_cost: material.unit_cost_override !== null && material.unit_cost_override !== undefined
                  ? material.unit_cost_override
                  : material.inventory_price,
                line_total: roundMoney(
                  Number(material.quantity || 0)
                  * (
                    material.unit_cost_override !== null && material.unit_cost_override !== undefined
                      ? Number(material.unit_cost_override || 0)
                      : Number(material.inventory_price || 0)
                  )
                ),
                notes: material.notes,
              })),
            }
          : parseJsonSafe(item?.details_json || item?.details, null)

        const unitPrice = service
          ? Number(service.suggested_price) || 0
          : Math.max(0, Number(item?.unit_price ?? item?.default_price) || 0)
        const baseAmount = service
          ? roundMoney((Number(service.materials_cost) || 0) + (Number(service.consultation_fee) || 0))
          : Math.max(0, Number(item?.base_amount) || 0)
        const markupPercentage = service
          ? Number(service.profit_percentage) || 0
          : Math.max(0, Number(item?.markup_percentage) || 0)

        return {
          ...base,
          item_type: 'service',
          catalog_service_id: service?.id || (serviceId > 0 ? serviceId : null),
          source_inventory_id: null,
          category: String(service?.category || item?.category || '').trim() || null,
          service_name: String(service?.service_name || fallbackName).trim(),
          quantity,
          base_amount: baseAmount,
          markup_percentage: markupPercentage,
          unit_price: unitPrice,
          line_total: roundMoney(quantity * unitPrice),
          details_json: serviceDetails ? JSON.stringify(serviceDetails) : null,
        }
      }

      if (itemType === 'supply') {
        const inventoryId = Number(item?.source_inventory_id || item?.inventory_id || 0)
        const inventoryItem = inventoryMap.get(inventoryId)
        const name = String(item?.service_name || item?.name || inventoryItem?.name || '').trim()
        if (!name) return null

        const unitPrice = Math.max(
          0,
          Number(item?.unit_price ?? inventoryItem?.price) || 0
        )
        const details = {
          source: 'inventory',
          inventory_id: inventoryId || null,
          inventory_name: inventoryItem?.name || name,
          unit: inventoryItem?.unit || item?.unit_label || null,
        }

        return {
          ...base,
          item_type: 'supply',
          catalog_service_id: null,
          source_inventory_id: inventoryId || null,
          category: String(item?.category || inventoryItem?.category || 'Medicine / Supply').trim() || 'Medicine / Supply',
          service_name: name,
          quantity,
          base_amount: unitPrice,
          markup_percentage: 0,
          unit_price: unitPrice,
          line_total: roundMoney(quantity * unitPrice),
          details_json: JSON.stringify(details),
        }
      }

      const serviceName = String(item?.service_name || item?.name || '').trim()
      if (!serviceName) return null
      const unitPrice = Math.max(0, Number(item?.unit_price ?? item?.default_price) || 0)
      const baseAmount = item?.base_amount === '' || item?.base_amount === null || item?.base_amount === undefined
        ? unitPrice
        : Math.max(0, Number(item.base_amount) || 0)
      const markupPercentage = Math.max(0, Number(item?.markup_percentage) || 0)
      const details = parseJsonSafe(item?.details_json || item?.details, null)

      return {
        ...base,
        item_type: 'custom',
        catalog_service_id: item?.catalog_service_id ? Number(item.catalog_service_id) : null,
        source_inventory_id: item?.source_inventory_id ? Number(item.source_inventory_id) : null,
        category: String(item?.category || '').trim() || null,
        service_name: serviceName,
        quantity,
        base_amount: baseAmount,
        markup_percentage: markupPercentage,
        unit_price: unitPrice,
        line_total: roundMoney(quantity * unitPrice),
        details_json: details ? JSON.stringify(details) : null,
      }
    })
    .filter(Boolean)
}

const getBillingRecordWithItems = async (billingId, executor = db) => {
  const [records] = await executor.query(
    `SELECT
       b.*,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       a.appointment_time,
       a.reason AS appointment_reason,
       a.clinic_type,
       p.full_name AS patient_name,
       p.phone AS patient_phone,
       d.full_name AS doctor_name,
       d.specialty AS doctor_specialty,
       s.full_name AS confirmed_by_staff_name
     FROM billing_records b
     JOIN appointments a ON a.id = b.appointment_id
     JOIN patients p ON p.id = b.patient_id
     JOIN doctors d ON d.id = b.doctor_id
     LEFT JOIN staff s ON s.id = b.confirmed_by_staff_id
     WHERE b.id = ?
     LIMIT 1`,
    [billingId]
  )

  if (records.length === 0) return null

  const [items] = await executor.query(
    `SELECT
       id,
       billing_id,
       catalog_service_id,
       item_type,
       source_inventory_id,
       category,
       service_name,
       quantity,
       base_amount,
       markup_percentage,
       unit_price,
       line_total,
       details_json,
       notes,
       sort_order
     FROM billing_items
     WHERE billing_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [billingId]
  )

  return {
    ...records[0],
    items: items.map((item) => ({
      ...item,
      details: parseJsonSafe(item.details_json, null),
    })),
  }
}

const getBillingByAppointmentId = async (appointmentId, executor = db) => {
  const [rows] = await executor.query(
    'SELECT id FROM billing_records WHERE appointment_id = ? LIMIT 1',
    [appointmentId]
  )

  if (rows.length === 0) return null
  return getBillingRecordWithItems(rows[0].id, executor)
}

const saveBillingItems = async (billingId, items, executor = db) => {
  await executor.query('DELETE FROM billing_items WHERE billing_id = ?', [billingId])

  for (const item of items) {
    await executor.query(
      `INSERT INTO billing_items
       (billing_id, catalog_service_id, item_type, source_inventory_id, category, service_name, quantity, base_amount, markup_percentage, unit_price, line_total, details_json, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billingId,
        item.catalog_service_id || null,
        item.item_type || 'custom',
        item.source_inventory_id || null,
        item.category,
        item.service_name,
        item.quantity,
        item.base_amount || 0,
        item.markup_percentage || 0,
        item.unit_price,
        item.line_total,
        item.details_json || null,
        item.notes,
        item.sort_order,
      ]
    )
  }
}

const upsertDraftBillingForAppointment = async ({
  appointment,
  consultationId = null,
  items = [],
}, executor = db) => {
  const normalizedItems = await normalizeBillingItems(items, executor)
  const totals = computeBillingTotals({ items: normalizedItems, discount_amount: 0 })

  const [existingRows] = await executor.query(
    'SELECT id, status, discount_type, discount_label, discount_amount, payment_method, payment_notes, confirmed_by_staff_id, paid_at FROM billing_records WHERE appointment_id = ? LIMIT 1',
    [appointment.id]
  )

  if (existingRows.length > 0) {
    const existing = existingRows[0]
    if (existing.status === 'paid') {
      return getBillingRecordWithItems(existing.id, executor)
    }

    const computed = computeBillingTotals({
      items: normalizedItems,
      discount_amount: existing.discount_amount,
    })

    await executor.query(
      `UPDATE billing_records
       SET consultation_id = ?, subtotal = ?, total_amount = ?
       WHERE id = ?`,
      [consultationId, computed.subtotal, computed.total_amount, existing.id]
    )

    await saveBillingItems(existing.id, normalizedItems, executor)
    return getBillingRecordWithItems(existing.id, executor)
  }

  const [result] = await executor.query(
    `INSERT INTO billing_records
     (appointment_id, consultation_id, patient_id, doctor_id, status, subtotal, discount_type, discount_amount, total_amount)
     VALUES (?, ?, ?, ?, 'pending', ?, 'none', 0.00, ?)`,
    [
      appointment.id,
      consultationId,
      appointment.patient_id,
      appointment.doctor_id,
      totals.subtotal,
      totals.total_amount,
    ]
  )

  await saveBillingItems(result.insertId, normalizedItems, executor)
  return getBillingRecordWithItems(result.insertId, executor)
}

function itemTypeFromRaw(item = {}) {
  const explicit = String(item?.item_type || '').trim().toLowerCase()
  if (['service', 'supply', 'custom'].includes(explicit)) return explicit
  if (Number(item?.source_inventory_id || item?.inventory_id || 0) > 0) return 'supply'
  if (Number(item?.catalog_service_id || item?.id || 0) > 0) return 'service'
  return 'custom'
}

module.exports = {
  roundMoney,
  normalizeServiceMaterials,
  computeCatalogServicePricing,
  normalizeBillingItems,
  computeBillingTotals,
  collectInventoryUsageFromBillingItems,
  listBillingCatalog,
  getBillingCatalogServiceById,
  getBillingRecordWithItems,
  getBillingByAppointmentId,
  saveBillingItems,
  upsertDraftBillingForAppointment,
}
