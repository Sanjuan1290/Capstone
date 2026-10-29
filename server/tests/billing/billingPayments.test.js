const { isValidPaymentMethod, requiresPaymentReference, makeReceiptNumber, calculatePaymentAmounts } = require('../../utils/payments')

describe('billing payments', () => {
  it('validates supported methods and reference rules', () => {
    // The clinic now accepts new Cash or PayMongo QR Ph payments only.
    expect(isValidPaymentMethod('cash')).toBe(true)
    expect(isValidPaymentMethod('QRPH')).toBe(true)
    for (const retiredMethod of ['GCASH', 'maya', 'bank_transfer', 'cheque']) {
      expect(isValidPaymentMethod(retiredMethod)).toBe(false)
      expect(requiresPaymentReference(retiredMethod)).toBe(false)
    }
    expect(requiresPaymentReference('cash')).toBe(false)
    expect(requiresPaymentReference('qrph')).toBe(true)
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

