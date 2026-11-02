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

  it('keeps the saved base Service Price and total patient price without computing a markup from legacy cost data', () => {
    const result = computeCatalogServicePricing({
      default_price: 750,
      consultation_fee: 100,
      profit_percentage: 20,
      materials: [{ quantity: 2, inventory_price: 50 }],
    })
    // Legacy acquisition-cost/profit fields are not computed by this function.
    // The base fee must survive catalog hydration for subsequent service edits.
    expect(result).not.toHaveProperty('materials_cost')
    expect(result).not.toHaveProperty('profit_amount')
    expect(result.consultation_fee).toBe(100)
    expect(result).toMatchObject({
      default_price: 750,
      suggested_price: 750,
      patient_price: 750,
    })
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
    expect(result).not.toHaveProperty('materials_cost')
    expect(result.patient_price).toBe(1200)
    expect(result.consultation_fee).toBe(0)
  })

  it('does not invent a service price when none is configured', () => {
    const result = computeCatalogServicePricing({
      materials: [{ quantity: 5, inventory_price: 100 }],
    })
    expect(result.default_price).toBe(0)
    expect(result.patient_price).toBe(0)
  })

  it('does not change the saved total or double-count supplies on repeated hydration', () => {
    const initial = {
      id: 12,
      default_price: 455,
      consultation_fee: 350,
      materials: [
        { inventory_id: 17, material_name: 'Gloves', quantity: 1, inventory_price: 40 },
        { inventory_id: 22, material_name: 'Saline', quantity: 1, inventory_price: 65 },
      ],
    }
    const hydrated = computeCatalogServicePricing(computeCatalogServicePricing(initial))
    expect(hydrated).toMatchObject({
      consultation_fee: 350,
      default_price: 455,
      patient_price: 455,
      suggested_price: 455,
    })
    expect(hydrated.materials).toHaveLength(2)
  })
})

