const {
  buildConsultationBillingItems,
  collectInventoryUsageFromBillingItems,
  normalizeBillingItems,
} = require('../../utils/billing')

describe('consultation extra consumables billing', () => {
  it('separates fixed service consumables from additional consultation consumables, including the same inventory item', () => {
    const rows = buildConsultationBillingItems([{
      item_type: 'service',
      catalog_service_id: 10,
      service_name: 'ForeSkin',
      quantity: 1,
      materials: [
        { inventory_id: 7, material_name: 'Syringe 2.5 ml', quantity: 1, unit_label: 'unit' },
        { inventory_id: 7, material_name: 'Syringe 2.5 ml', quantity: 2, unit_label: 'unit', consultation_extra: true },
      ],
    }], 44)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ item_type: 'service', source_type: 'consultation', source_reference_id: 44 })
    expect(rows[0].materials).toEqual([{ inventory_id: 7, material_name: 'Syringe 2.5 ml', quantity: 1, unit_label: 'unit' }])
    expect(rows[1]).toMatchObject({ item_type: 'supply', source_type: 'consultation_extra', source_inventory_id: 7, catalog_service_id: 10, quantity: 2 })
  })

  it('aggregates fixed plus additional quantities for inventory consumption exactly once', () => {
    const usage = collectInventoryUsageFromBillingItems([
      {
        item_type: 'service', quantity: 1, service_name: 'ForeSkin',
        details: { materials: [{ inventory_id: 7, material_name: 'Syringe 2.5 ml', quantity: 1, unit_label: 'unit' }] },
      },
      {
        item_type: 'supply', source_type: 'consultation_extra', source_inventory_id: 7,
        service_name: 'Syringe 2.5 ml', quantity: 2, details: { unit: 'unit' },
      },
    ])
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ inventory_id: 7, quantity: 3, unit_label: 'unit' })
  })

  it('prices an additional consultation consumable from the inventory Selling Price snapshot', async () => {
    const executor = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('FROM inventory') && String(sql).includes('WHERE id IN')) {
          return [[{ id: 7, name: 'Syringe 2.5 ml', category: 'derma', unit: 'unit', base_unit: 'unit', uom: 'unit', price: 25, selling_price: 40 }]]
        }
        throw new Error(`Unexpected query: ${sql}`)
      }),
    }
    const [line] = await normalizeBillingItems([{
      item_type: 'supply', source_type: 'consultation_extra', source_inventory_id: 7,
      service_name: 'Syringe 2.5 ml', quantity: 2, details: { consultation_extra: true, unit: 'unit' },
    }], executor)
    expect(line.source_type).toBe('consultation_extra')
    expect(line.unit_price).toBe(40)
    expect(line.line_total).toBe(80)
  })
})

