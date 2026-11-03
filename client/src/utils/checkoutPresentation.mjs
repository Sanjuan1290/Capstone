/** Pure presentational state. Does not modify a bill, payment, stock, or discounts. */
export function checkoutNotice({ bill = {}, dirty = false, saving = false, finalizing = false, paying = false, qrPending = false, reopening = false, versionConflict = false } = {}) {
  if (versionConflict) return { tone: 'rose', kind: 'warning', title: 'Bill changed in another session', message: 'Reload the latest version before making more changes. Your unsaved edits were not applied.' }
  if (paying || finalizing || saving || reopening) return { tone: 'sky', kind: 'busy', title: paying ? 'Recording payment…' : finalizing ? 'Confirming the bill…' : reopening ? 'Reopening the bill…' : 'Saving changes…', message: 'Please do not submit the action again. The server is processing it.' }
  if (qrPending) return { tone: 'amber', kind: 'payment', title: 'QR payment is active', message: 'Wait for confirmation or cancel the QR flow before recording another payment.' }
  if (dirty) return { tone: 'amber', kind: 'warning', title: 'Unsaved billing changes', message: 'Save these changes before confirming the bill. Refreshing can discard your edits.' }
  if (bill?.status === 'paid') return { tone: 'emerald', kind: 'success', title: 'Payment complete', message: 'This bill is paid. You can view the recorded receipt below.' }
  if (bill?.status === 'partially_paid') return { tone: 'sky', kind: 'payment', title: 'Partial payment received', message: 'Collect only the remaining balance shown below.' }
  if (bill?.status === 'ready') return { tone: 'sky', kind: 'payment', title: 'Bill confirmed — ready for payment', message: 'Charges are locked. Record payment only after receiving it.' }
  if (['voided', 'refunded'].includes(bill?.status)) return { tone: 'slate', kind: 'info', title: bill.status === 'voided' ? 'Bill voided' : 'Bill refunded', message: 'No further payment should be collected from this billing record.' }
  return { tone: 'sky', kind: 'info', title: 'Review your billing details', message: 'Check the amounts and charges before confirming the bill.' }
}

export function checkoutOverviewValues({ bill = {}, totals = {} } = {}) {
  const draft = ['draft', 'pending'].includes(bill?.status)
  return {
    draft,
    total: draft ? Number(totals?.total || 0) : Number(bill?.total_amount || 0),
    paid: Number(bill?.paid_amount || 0),
    balance: draft ? Number(totals?.total || 0) : Number(bill?.balance_amount || 0),
  }
}
