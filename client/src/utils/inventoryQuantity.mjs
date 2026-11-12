// Whole-unit displays omit trailing .00. Historical fractional movements remain
// visible at their recorded precision instead of being silently rounded away.
export function formatInventoryQuantity(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity.toLocaleString('en-PH', { maximumFractionDigits: 4 }) : 'Not recorded'
}
