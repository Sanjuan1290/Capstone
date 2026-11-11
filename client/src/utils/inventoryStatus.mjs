export const inventoryStockCount = (item) => {
  const unitSize = Number(item.unit_size || 1)
  const stockBase = item.available_stock != null ? Number(item.available_stock) * unitSize : Number(item.stock_base ?? Number(item.stock || 0) * unitSize)
  return Math.floor(stockBase / unitSize)
}

const dateDay = (value) => {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null
  return timestamp / 86400000
}

export const inventoryExpiringSoon = (item, now = new Date()) => {
  const today = dateDay(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))
  const expiring = (value) => {
    const expiry = dateDay(value)
    return expiry !== null && expiry >= today && expiry <= today + 30
  }
  // Check every stocked batch: an older expired batch must not hide another
  // batch that is due to expire soon. Archived/depleted batches do not count.
  if (Array.isArray(item.batches) && item.batches.length) {
    return item.batches.some(batch => !batch.archived_at && Number(batch.available_quantity ?? batch.quantity) > 0 && expiring(batch.expiration_date))
  }
  return inventoryStockCount(item) > 0 && expiring(item.expiration_date)
}

export const matchesInventoryStatus = (item, status, now = new Date()) => {
  const count = inventoryStockCount(item)
  if (status === 'low') return count > 0 && count <= Number(item.threshold || 0)
  if (status === 'out') return count <= 0
  if (status === 'expiring') return inventoryExpiringSoon(item, now)
  return true
}
