const resolveManualStockOutSelection = (body = {}) => {
  const quantity = Number(body.qty)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Enter a stock-out quantity greater than zero.')
    error.statusCode = 400
    throw error
  }

  let batchId = Number(body.batch_id)
  const legacy = Array.isArray(body.selected_batches)
    ? body.selected_batches.filter((entry) => Number(entry?.batch_id) > 0 && Number(entry?.quantity) > 0)
    : []

  if (!batchId && legacy.length === 1) batchId = Number(legacy[0].batch_id)
  if (legacy.length > 1) {
    const error = new Error('Manual Stock Out now uses one batch per transaction. Select one batch and try again.')
    error.statusCode = 400
    error.code = 'ONE_BATCH_PER_STOCK_OUT'
    throw error
  }
  if (!batchId) {
    const error = new Error('Select the batch / lot you are stocking out.')
    error.statusCode = 400
    error.code = 'BATCH_REQUIRED'
    throw error
  }
  if (batchId && legacy.length === 1 && Number(legacy[0].batch_id) !== batchId) {
    const error = new Error('The selected batch does not match the submitted batch allocation.')
    error.statusCode = 400
    throw error
  }
  if (legacy.length === 1 && Number(legacy[0].quantity) !== quantity) {
    const error = new Error('The selected batch quantity must match the stock-out quantity.')
    error.statusCode = 400
    throw error
  }
  const locationId = Number(body.storage_location_id || body.location_id) || null
  return { batchId, quantity, locationId }
}

module.exports = { resolveManualStockOutSelection }

