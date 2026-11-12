const { resolveDiscountForDraft } = require('../../utils/billingSecurity')

describe('discount proof policy', () => {
  const executor = {
    query: vi.fn(async (sql) => {
      if (String(sql).includes('FROM discount_presets')) {
        return [[{ id: 3, label: 'PWD', discount_type: 'percentage', value: 20, requires_reference: 1, requires_admin_approval: 0, is_active: 1 }]]
      }
      throw new Error(`Unexpected query: ${sql}`)
    }),
  }

  it('allows an in-person verified ID without a file upload', async () => {
    const result = await resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 3 }, executor, { allowDirectAdmin: true })
    expect(result.amount).toBe(200)
  })

  it('preserves historical proof URL compatibility while computing the discount', async () => {
    const result = await resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 3, referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/pwd.jpg' }, executor, { allowDirectAdmin: true })
    expect(result.amount).toBe(200)
  })
})

