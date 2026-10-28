const fs = require('fs')
const path = require('path')
const { resolveManualStockOutSelection } = require('../../utils/manualInventoryPolicy')

describe('manual stock-out policy', () => {
  it('requires one explicit batch', () => {
    expect(() => resolveManualStockOutSelection({ qty: 2 })).toThrow(/select the batch/i)
  })

  it('accepts a single batch and quantity', () => {
    expect(resolveManualStockOutSelection({ qty: 2, batch_id: 14 })).toEqual({ batchId: 14, quantity: 2, locationId: null })
  })

  it('rejects multi-batch manual allocation', () => {
    expect(() => resolveManualStockOutSelection({
      qty: 3,
      selected_batches: [
        { batch_id: 1, quantity: 1 },
        { batch_id: 2, quantity: 2 },
      ],
    })).toThrow(/one batch per transaction/i)
  })

  it('keeps temporary compatibility with one old selected_batches entry', () => {
    expect(resolveManualStockOutSelection({ qty: 3, selected_batches: [{ batch_id: 7, quantity: 3 }] }))
      .toEqual({ batchId: 7, quantity: 3, locationId: null })
  })

  it('keeps an explicitly selected storage location with the batch', () => {
    expect(resolveManualStockOutSelection({ qty: 2, batch_id: 14, storage_location_id: 5 }))
      .toEqual({ batchId: 14, quantity: 2, locationId: 5 })
  })

  it('manual service never uses automatic FEFO', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'manualInventoryMovement.js'), 'utf8')
    expect(source).not.toContain('consumeInventoryFEFO')
    expect(source).toContain('consumeInventoryFromLocationByBatches')
  })
})
