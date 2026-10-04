const { normalizeBillingItems } = require('../../utils/billing')

describe('billing input hardening', () => {
  it('rejects zero-price custom charges', async () => {
    await expect(normalizeBillingItems([
      { item_type: 'custom', service_name: 'Free-looking charge', quantity: 1, unit_price: 0 },
    ])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects excessively long custom descriptions', async () => {
    await expect(normalizeBillingItems([
      { item_type: 'custom', service_name: 'X'.repeat(181), quantity: 1, unit_price: 100 },
    ])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects malformed quantity types', async () => {
    await expect(normalizeBillingItems([
      { item_type: 'custom', service_name: 'Consultation misc.', quantity: ['1'], unit_price: 100 },
    ])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('accepts a valid Unicode custom charge', async () => {
    const rows = await normalizeBillingItems([
      { item_type: 'custom', service_name: 'Care package – follow‑up 😊', quantity: 2, unit_price: 125.5 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      item_type: 'custom',
      service_name: 'Care package – follow‑up 😊',
      quantity: 2,
      unit_price: 125.5,
      line_total: 251,
    })
  })
})
