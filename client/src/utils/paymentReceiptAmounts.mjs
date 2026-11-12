// Tender and change must come from the saved payment, never the current bill balance.
const savedAmount = value => {
  if (value == null || String(value).trim() === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function paymentReceiptAmounts(payment) {
  const rows = [{ label: payment?.status === 'voided' ? 'Voided Amount' : 'Amount Paid', amount: savedAmount(payment?.amount) }]
  if (String(payment?.payment_method || '').trim().toLowerCase() === 'cash') {
    rows.push(
      { label: 'Cash Received', amount: savedAmount(payment.amount_received) },
      { label: 'Change', amount: savedAmount(payment.change_amount) },
    )
  }
  return rows
}
