// Branch-specific sequential inventory barcode allocation. Call inside the
// surrounding inventory transaction so the increment rolls back on failure.
const requireBranch = value => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw Object.assign(new Error('A verified branch is required for barcode allocation.'), { statusCode: 403, code: 'BRANCH_REQUIRED' })
  }
  return id
}

const nextInventoryBarcode = async (category, branchId, executor) => {
  const id = requireBranch(branchId)
  if (!executor || typeof executor.query !== 'function') throw new TypeError('Transaction executor required')
  const normalized = category === 'derma' ? 'derma' : 'medical'
  const prefix = normalized === 'derma' ? 'DRM' : 'GMED'
  const [[branch]] = await executor.query('SELECT code FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1', [id])
  if (!branch?.code) throw Object.assign(new Error('Branch unavailable for barcode allocation.'), { statusCode: 404, code: 'BRANCH_NOT_FOUND' })
  await executor.query('INSERT IGNORE INTO inventory_barcode_sequences (category, branch_id, last_number) VALUES (?,?,0)', [normalized, id])
  const [updated] = await executor.query('UPDATE inventory_barcode_sequences SET last_number=LAST_INSERT_ID(last_number+1) WHERE category=? AND branch_id=?', [normalized, id])
  const number = Number(updated?.insertId)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Barcode counter unavailable.')
  const branchCode = String(branch.code).toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!branchCode) throw new Error('Invalid branch barcode prefix.')
  return `${prefix}-${branchCode}-${String(number).padStart(5, '0')}`
}
module.exports = { nextInventoryBarcode, requireBranch }


