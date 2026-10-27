// Read-only payment preview. This module does not record or authorize a payment.
const toCents = (value) => {
  const raw = String(value ?? '').trim()
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(raw)) return null
  const parts = raw.split('.')
  const cents = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null
}

export function calculatePaymentPreview({ bill, draft }) {
  const balance = toCents(bill?.balance_amount)
  const payment = toCents(draft?.payment_amount)
  if (balance === null || payment === null || payment < 1 || balance < 1 || payment > balance) {
    return { valid: false, message: 'Enter a valid payment amount within the outstanding balance.' }
  }
  const cash = draft?.payment_method === 'cash'
  const tendered = cash ? toCents(draft?.amount_received) : null
  if (cash && (tendered === null || tendered < payment)) {
    return { valid: false, message: 'Cash received must cover the payment amount.' }
  }
  return {
    valid: true,
    amount: payment / 100,
    isCash: cash,
    cashReceived: cash ? tendered / 100 : null,
    change: cash ? (tendered - payment) / 100 : null,
    balanceAfter: (balance - payment) / 100,
  }
}

