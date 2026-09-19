const { resolveDiscountForDraft, applyApprovedPriceOverrides } = require('../../utils/billingSecurity')

describe('billing authorization', () => {
  it('calculates ordinary percentage discounts on the server', async () => {
    const executor = {
      query: vi.fn().mockResolvedValueOnce([[{
        id: 3, label: 'Senior', discount_type: 'percentage', value: 20,
        requires_reference: 1, requires_admin_approval: 0, is_active: 1,
      }]])
    }
    const result = await resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 3, reference: 'SC-123' }, executor)
    expect(result.amount).toBe(200)
    expect(result.label).toBe('Senior')
  })

  it('blocks protected discounts without an Admin approval record', async () => {
    const executor = {
      query: vi.fn()
        .mockResolvedValueOnce([[{
          id: 9, label: 'Courtesy', discount_type: 'fixed', value: 250,
          requires_reference: 0, requires_admin_approval: 1, is_active: 1,
        }]])
        .mockResolvedValueOnce([[]]),
    }
    await expect(resolveDiscountForDraft({ billingId: 8, subtotal: 1000, presetId: 9 }, executor))
      .rejects.toMatchObject({ code: 'DISCOUNT_APPROVAL_REQUIRED' })
  })

  it('blocks service price overrides without Admin approval', async () => {
    const executor = { query: vi.fn().mockResolvedValueOnce([[]]) }
    await expect(applyApprovedPriceOverrides(8, [{
      item_type: 'service', catalog_service_id: 5, service_name: 'Consultation', unit_price: 1, price_overridden: true,
    }], executor)).rejects.toMatchObject({ code: 'PRICE_OVERRIDE_APPROVAL_REQUIRED' })
  })
})
