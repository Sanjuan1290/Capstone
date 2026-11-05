export const dateOnly = value => value ? String(value).slice(0, 10) : ''
export const money = value => new Intl.NumberFormat('en-PH', {style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value) || 0)
export const number = value => new Intl.NumberFormat('en-PH', {maximumFractionDigits: 2}).format(Number(value) || 0)

export const statusLabels = item => {
  const labels = []
  if (item?.out) labels.push({label: 'Out of stock', tone: 'danger'})
  if (item?.low) labels.push({label: 'Low stock', tone: 'warning'})
  if (item?.expired) labels.push({label: 'Expired stock', tone: 'danger'})
  else if (item?.expiring) labels.push({label: 'Expiring soon', tone: 'warning'})
  return labels.length ? labels : [{label: 'In stock', tone: 'success'}]
}

export const branchesWithStock = item => (Array.isArray(item?.per_branch) ? item.per_branch : [])
  .filter(branch => Number(branch.quantity_base) > 0)

// A shared product may have a different selling price in each branch.
// Never average prices, as that would misrepresent the original item prices.
export const sellingPriceLabel = item => {
  const stocked = branchesWithStock(item)
  const rows = stocked.length ? stocked : (Array.isArray(item?.per_branch) ? item.per_branch : [])
  if (!rows.length) return '—'
  const prices = rows.map(row => row.selling_price == null ? NaN : Number(row.selling_price))
  if (prices.some(price => !Number.isFinite(price))) return '—'
  return new Set(prices.map(price => price.toFixed(2))).size === 1 ? money(prices[0]) : 'Varies by branch'
}

export const createInventoryCsv = rows => {
  const csvCell = value => {
    let text = String(value ?? '')
    if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  const headings = [
    'Product', 'Category', 'Type', 'Total stock (base units)', 'Stock unit',
    'Selling price (PHP)', 'Branches with stock', 'Total selling value (PHP)',
    'Stock alerts', 'Nearest expiry', 'Branch selling value details'
  ]
  const lines = rows.map(item => [
    item.name, item.category, item.item_type, item.quantity_base, item.base_unit || '',
    sellingPriceLabel(item), branchesWithStock(item).length, Number(item.selling_value) || 0,
    statusLabels(item).map(state => state.label).join('; '), dateOnly(item.nearest_expiry),
    (item.per_branch || []).map(branch => `${branch.branch_name}: ${number(branch.quantity_base)} ${item.base_unit || 'base units'}; selling price ${branch.selling_price == null ? 'Not set' : money(branch.selling_price)} per ${branch.selling_unit || 'item'}; selling value ${money(branch.selling_value)}`).join(' | ')
  ])
  return '\uFEFF' + [headings, ...lines].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export const buildFilters = filters => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== false && value !== null && value !== undefined) params.set(key, String(value))
  }
  return params.toString()
}
