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

  it('requires proof when the preset requires a reference', async () => {
    await expect(resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 3 }, executor, { allowDirectAdmin: true }))
      .rejects.toMatchObject({ code: 'DISCOUNT_PROOF_REQUIRED' })
  })

  it('accepts the uploaded proof URL and computes the discount', async () => {
    const result = await resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 3, referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/pwd.jpg' }, executor, { allowDirectAdmin: true })
    expect(result.amount).toBe(200)
  })
})
