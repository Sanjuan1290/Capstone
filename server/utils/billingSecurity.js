const db = require('../db/connect')
const { roundMoney } = require('./billing')

const loadDiscountPreset = async (presetId, executor = db) => {
  const id = Number(presetId)
  if (!id) return null
  const [rows] = await executor.query(
    `SELECT id, label, discount_type, value, requires_reference, requires_admin_approval, is_active
     FROM discount_presets WHERE id = ? LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

const getApprovedAdjustment = async ({ billingId, requestType, discountPresetId = null, catalogServiceId = null, requestedPrice = null }, executor = db) => {
  const params = [billingId, requestType]
  const filters = ['billing_id = ?', 'request_type = ?', "status = 'approved'"]
  if (discountPresetId) { filters.push('discount_preset_id = ?'); params.push(Number(discountPresetId)) }
  if (catalogServiceId) { filters.push('catalog_service_id = ?'); params.push(Number(catalogServiceId)) }
  if (requestedPrice !== null && requestedPrice !== undefined) { filters.push('ABS(requested_price - ?) < 0.001'); params.push(Number(requestedPrice)) }
  const [rows] = await executor.query(
    `SELECT * FROM billing_adjustment_requests WHERE ${filters.join(' AND ')} ORDER BY resolved_at DESC, id DESC LIMIT 1`,
    params
  )
  return rows[0] || null
}

const resolveDiscountForDraft = async ({ billingId, subtotal, presetId, reference, requestedAmount }, executor = db) => {
  if (!presetId) return { type: 'none', label: null, amount: 0, preset: null }
  const preset = await loadDiscountPreset(presetId, executor)
  if (!preset || Number(preset.is_active) === 0) throw Object.assign(new Error('Selected discount is unavailable.'), { statusCode: 400 })
  if (Number(preset.requires_reference) && !String(reference || '').trim()) {
    throw Object.assign(new Error(`${preset.label} discount requires a reference or ID.`), { statusCode: 400 })
  }

  let amount = preset.discount_type === 'percentage'
    ? roundMoney(Number(subtotal || 0) * (Number(preset.value || 0) / 100))
    : Math.max(0, roundMoney(Number(preset.value || 0)))

  const requiresApproval = Number(preset.requires_admin_approval) === 1 || (preset.discount_type === 'fixed' && Number(preset.value || 0) <= 0)
  if (requiresApproval) {
    const approval = await getApprovedAdjustment({ billingId, requestType: 'discount', discountPresetId: preset.id }, executor)
    if (!approval) {
      const err = new Error(`${preset.label} discount requires administrator approval.`)
      err.statusCode = 403
      err.code = 'DISCOUNT_APPROVAL_REQUIRED'
      throw err
    }
    amount = Math.max(0, roundMoney(Number(approval.requested_amount || requestedAmount || amount) || 0))
  }

  return {
    type: preset.discount_type,
    label: preset.label,
    amount: Math.min(Math.max(0, Number(subtotal || 0)), amount),
    preset,
  }
}

const applyApprovedPriceOverrides = async (billingId, items = [], executor = db) => {
  const result = []
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.item_type !== 'service' || !item?.price_overridden) {
      result.push({ ...item, price_overridden: false, override_reason: null })
      continue
    }
    const requestedPrice = Math.max(0, Number(item.unit_price) || 0)
    const approval = await getApprovedAdjustment({
      billingId,
      requestType: 'price_override',
      catalogServiceId: item.catalog_service_id,
      requestedPrice,
    }, executor)
    if (!approval) {
      const err = new Error(`Price override for ${item.service_name || 'service'} requires administrator approval.`)
      err.statusCode = 403
      err.code = 'PRICE_OVERRIDE_APPROVAL_REQUIRED'
      throw err
    }
    result.push({ ...item, price_overridden: true, override_reason: approval.reason || item.override_reason || 'Administrator approved' })
  }
  return result
}

module.exports = { loadDiscountPreset, getApprovedAdjustment, resolveDiscountForDraft, applyApprovedPriceOverrides }
