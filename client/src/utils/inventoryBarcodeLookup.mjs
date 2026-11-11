// Find an item by its saved Product Barcode. Batch codes are text identifiers, not scan targets.
export const normalizeProductBarcode = value => String(value ?? '').trim().toUpperCase()

export const findScannedInventoryItem = (rawCode, activeItems = [], archivedItems = []) => {
  const code = normalizeProductBarcode(rawCode)
  if (!code) return { status: 'not_found', code }
  const active = activeItems.find(item => normalizeProductBarcode(item.barcode) === code)
  if (active) return { status: 'active', code, item: active }
  const archived = archivedItems.find(item => normalizeProductBarcode(item.barcode) === code)
  if (archived) return { status: 'archived', code, item: archived }
  return { status: 'not_found', code }
}
