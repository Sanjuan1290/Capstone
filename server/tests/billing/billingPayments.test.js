const { isValidPaymentMethod, requiresPaymentReference, makeReceiptNumber, calculatePaymentAmounts } = require('../../utils/payments')

describe('billing payments', () => {
  it('validates supported methods and reference rules', () => {
    expect(isValidPaymentMethod('GCASH')).toBe(true)
    expect(isValidPaymentMethod('cheque')).toBe(false)
    expect(requiresPaymentReference('cash')).toBe(false)
    expect(requiresPaymentReference('maya')).toBe(true)
  })

  it('calculates received amount and change using centavo precision', () => {
    expect(calculatePaymentAmounts({ totalAmount: 950.25, amountReceived: 1000 }))
      .toEqual({ total: 950.25, amountReceived: 1000, changeAmount: 49.75, isSufficient: true })
    expect(calculatePaymentAmounts({ totalAmount: 1000, amountReceived: 900 }).isSufficient).toBe(false)
  })

  it('creates a stable receipt format', () => {
    expect(makeReceiptNumber(42, new Date('2026-07-21T00:00:00.000Z'), 'a1b2c3')).toBe('OR-20260721-42-A1B2C3')
  })
})



