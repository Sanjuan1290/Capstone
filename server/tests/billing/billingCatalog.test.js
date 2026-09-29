const { normalizeServiceMaterials, computeCatalogServicePricing, getServiceMaterialUnitCost } = require('../../utils/billing')

describe('billing catalog pricing', () => {
  it('removes empty consumables and normalizes valid entries', () => {
    const materials = normalizeServiceMaterials([
      { inventory_id: '2', material_name: 'Syringe', quantity: '2' },
      { material_name: '', quantity: 1 },
    ])
    expect(materials).toHaveLength(1)
    expect(materials[0]).toMatchObject({ inventory_id: 2, material_name: 'Syringe', quantity: 2 })
  })

  it('uses the explicit Service Price and does not infer acquisition/material cost', () => {
    const result = computeCatalogServicePricing({
      default_price: 750,
      consultation_fee: 100,
      profit_percentage: 20,
      materials: [{ quantity: 2, inventory_price: 50 }],
    })
    expect(result.materials_cost).toBe(0)
    expect(result.consultation_fee).toBe(0)
    expect(result.profit_percentage).toBe(0)
    expect(result.profit_amount).toBe(0)
    expect(result.suggested_price).toBe(750)
    expect(result.patient_price).toBe(750)
  })

  it('never treats linked inventory Selling Price or old unit-cost overrides as service cost', () => {
    expect(getServiceMaterialUnitCost({
      inventory_id: 7,
      inventory_price: 50,
      unit_label: 'piece',
      unit_cost_override: 25,
    })).toBe(0)

    const result = computeCatalogServicePricing({
      default_price: 1200,
      materials: [{ inventory_id: 7, quantity: 2, inventory_price: 50, unit_cost_override: 25 }],
    })
    expect(result.materials_cost).toBe(0)
    expect(result.patient_price).toBe(1200)
  })

  it('does not invent a service price when none is configured', () => {
    const result = computeCatalogServicePricing({
      materials: [{ quantity: 5, inventory_price: 100 }],
    })
    expect(result.default_price).toBe(0)
    expect(result.patient_price).toBe(0)
  })
})

