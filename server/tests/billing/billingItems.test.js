const { computeBillingTotals, collectInventoryUsageFromBillingItems } = require('../../utils/billing')

describe('billing items', () => {
  it('calculates subtotal, discount and nonnegative total', () => {
    expect(computeBillingTotals({ items: [{ line_total: 150.25 }, { line_total: 49.75 }], discount_amount: 25 }))
      .toEqual({ subtotal: 200, discount_amount: 25, total_amount: 175 })
    expect(computeBillingTotals({ items: [{ line_total: 10 }], discount_amount: 20 }).total_amount).toBe(0)
  })

  it('aggregates inventory from supplies and service materials', () => {
    const usage = collectInventoryUsageFromBillingItems([
      { item_type: 'supply', source_inventory_id: 1, quantity: 2, service_name: 'Gauze' },
      {
        item_type: 'service', quantity: 2, service_name: 'Treatment',
        details: { materials: [{ inventory_id: 1, quantity: 0.5, material_name: 'Gauze' }, { inventory_id: 2, quantity: 1, material_name: 'Cream' }] },
      },
    ])
    expect(usage.find((row) => row.inventory_id === 1).quantity).toBe(3)
    expect(usage.find((row) => row.inventory_id === 2).quantity).toBe(2)
  })
})

