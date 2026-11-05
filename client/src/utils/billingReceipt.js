import { buildBillingReceiptHtml } from './billingReceiptTemplate.mjs'

/** Opens the shared A5 payment receipt in a print-only window. */
export const printBillingReceipt = ({ bill, payment, clinicSettings = {}, onPopupBlocked }) => {
  if (!bill || !payment) return false
  const popup = window.open('', '_blank', 'width=760,height=900')
  if (!popup) {
    onPopupBlocked?.()
    return false
  }
  // Absolute same-origin asset: the about:blank print document has no stable relative path.
  const logoUrl = new URL('/logo.png', window.location.origin).href
  let printed = false
  const openPrintDialog = () => {
    if (printed) return
    printed = true
    popup.focus()
    popup.print()
  }
  popup.document.open()
  popup.onload = openPrintDialog
  popup.document.write(buildBillingReceiptHtml({ bill, payment, clinicSettings, logoUrl }))
  popup.document.close()
  return true
}
