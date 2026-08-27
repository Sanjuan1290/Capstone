const { normalizeServiceMaterials, computeCatalogServicePricing } = require('../../utils/billing')

describe('billing catalog pricing', () => {
  it('removes empty materials and normalizes valid entries', () => {
    const materials = normalizeServiceMaterials([
      { inventory_id: '2', material_name: 'Syringe', quantity: '2', unit_cost_override: '15' },
      { material_name: '', quantity: 1 },
    ])
    expect(materials).toHaveLength(1)
    expect(materials[0]).toMatchObject({ inventory_id: 2, material_name: 'Syringe', quantity: 2, unit_cost_override: 15 })
  })

  it('calculates material cost, fee, markup and suggested price', () => {
    const result = computeCatalogServicePricing({
      consultation_fee: 100,
      profit_percentage: 20,
      materials: [{ quantity: 2, inventory_price: 50 }],
    })
    expect(result.materials_cost).toBe(100)
    expect(result.profit_amount).toBe(40)
    expect(result.suggested_price).toBe(240)
  })
})

