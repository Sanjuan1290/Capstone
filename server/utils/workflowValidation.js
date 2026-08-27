const QUEUE_STATUSES = new Set(['waiting', 'in-progress', 'done', 'removed'])
const SUPPLY_REQUEST_RESOLUTIONS = new Set(['approved', 'rejected'])
const STOCK_IN_MOVEMENT_TYPES = new Set(['received', 'returned', 'correction_in'])
const STOCK_OUT_MOVEMENT_TYPES = new Set(['adjustment_out', 'expired', 'damaged', 'wastage', 'returned_to_supplier'])

const isValidQueueStatus = (value) => QUEUE_STATUSES.has(String(value || '').trim())
const isValidSupplyRequestResolution = (value) => SUPPLY_REQUEST_RESOLUTIONS.has(String(value || '').trim())
const normalizeStockMovementType = (type, value) => {
  const normalized = String(value || '').trim()
  const allowed = type === 'in' ? STOCK_IN_MOVEMENT_TYPES : STOCK_OUT_MOVEMENT_TYPES
  if (allowed.has(normalized)) return normalized
  return type === 'in' ? 'received' : 'adjustment_out'
}

module.exports = {
  QUEUE_STATUSES,
  SUPPLY_REQUEST_RESOLUTIONS,
  STOCK_IN_MOVEMENT_TYPES,
  STOCK_OUT_MOVEMENT_TYPES,
  isValidQueueStatus,
  isValidSupplyRequestResolution,
  normalizeStockMovementType,
}

