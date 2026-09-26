import { formatMoney, paymentMethodLabel } from './billingUi'

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const paymentState = (payment) => {
  if (String(payment?.status || '').toLowerCase() === 'voided') return { label: 'VOIDED', tone: '#be123c' }
  const amount = Number(payment?.amount || 0)
  const refunded = Number(payment?.refund_amount || 0)
  if (refunded > 0 && refunded + 0.001 >= amount) return { label: 'REFUNDED', tone: '#7e22ce' }
  if (refunded > 0) return { label: 'PARTIALLY REFUNDED', tone: '#7e22ce' }
  return null
}

export const printBillingReceipt = ({ bill, payment, clinicSettings = {}, onPopupBlocked }) => {
  if (!bill || !payment) return false
  const popup = window.open('', '_blank', 'width=760,height=900')
  if (!popup) {
    onPopupBlocked?.()
    return false
  }
  const state = paymentState(payment)
  const refunded = Number(payment.refund_amount || 0)
  const netPayment = Math.max(0, Number(payment.amount || 0) - refunded)
  const rows = (bill.items || []).map((item) => `<tr><td>${escapeHtml(item.service_name)}</td><td style="text-align:center">${escapeHtml(item.quantity)}</td><td style="text-align:right">${escapeHtml(formatMoney(item.unit_price))}</td><td style="text-align:right">${escapeHtml(formatMoney(item.line_total))}</td></tr>`).join('')
  const statusMarkup = state ? `<div class="stamp" style="border-color:${state.tone};color:${state.tone}">${escapeHtml(state.label)}</div>` : ''
  const refundLines = refunded > 0 ? `<div class="line"><span>Original Payment</span><strong>${escapeHtml(formatMoney(payment.amount))}</strong></div><div class="line"><span>Refunded</span><strong>-${escapeHtml(formatMoney(refunded))}</strong></div><div class="line"><span>Net Payment</span><strong>${escapeHtml(formatMoney(netPayment))}</strong></div>` : `<div class="line"><span>This Payment</span><strong>${escapeHtml(formatMoney(payment.amount))}</strong></div>`
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payment.receipt_number || 'Receipt')}</title><style>@page{size:A5;margin:12mm}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}h1,p{margin:0}.head{text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px}.stamp{margin:12px auto 0;width:max-content;border:3px solid;border-radius:6px;padding:5px 12px;font-size:18px;font-weight:900;letter-spacing:2px;transform:rotate(-2deg)}.meta{margin:14px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.meta div:nth-child(even){text-align:right}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px;border-bottom:1px solid #e2e8f0}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b}.totals{margin-top:12px;margin-left:auto;width:250px}.line{display:flex;justify-content:space-between;padding:4px 0}.total{font-size:15px;font-weight:700;border-top:2px solid #0f172a;padding-top:7px}.footer{margin-top:28px;text-align:center;color:#64748b;font-size:10px}</style></head><body><div class="head"><h1>${escapeHtml(clinicSettings.clinic_name || 'CARAIT MEDICAL AND DERMATOLOGY CLINIC')}</h1>${clinicSettings.address ? `<p>${escapeHtml(clinicSettings.address)}</p>` : ''}${clinicSettings.phone ? `<p>${escapeHtml(clinicSettings.phone)}</p>` : ''}<p style="margin-top:7px;font-weight:700">${escapeHtml(clinicSettings.receipt_title || 'PAYMENT RECEIPT')}</p>${statusMarkup}</div><div class="meta"><div><strong>Receipt:</strong> ${escapeHtml(payment.receipt_number || '—')}</div><div>${escapeHtml(new Date(payment.paid_at || Date.now()).toLocaleString('en-PH'))}</div><div><strong>Patient:</strong> ${escapeHtml(bill.patient_name)}</div><div><strong>Doctor:</strong> ${escapeHtml(bill.doctor_name)}</div><div><strong>Method:</strong> ${escapeHtml(paymentMethodLabel(payment.payment_method))}</div><div>${payment.reference_number ? `<strong>Reference:</strong> ${escapeHtml(payment.reference_number)}` : ''}</div></div><table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="line"><span>Subtotal</span><strong>${escapeHtml(formatMoney(bill.subtotal))}</strong></div>${Number(bill.discount_amount || 0) > 0 ? `<div class="line"><span>${escapeHtml(bill.discount_label || 'Discount')}${bill.discount_reference ? ` (${escapeHtml(bill.discount_reference)})` : ''}</span><strong>-${escapeHtml(formatMoney(bill.discount_amount))}</strong></div>` : ''}<div class="line total"><span>Bill Total</span><strong>${escapeHtml(formatMoney(bill.total_amount))}</strong></div>${refundLines}<div class="line"><span>Paid to Date</span><strong>${escapeHtml(formatMoney(bill.paid_amount))}</strong></div><div class="line"><span><strong>Balance</strong></span><strong>${escapeHtml(formatMoney(bill.balance_amount))}</strong></div></div>${payment.refund_reason ? `<p style="margin-top:14px;color:#64748b"><strong>Refund reason:</strong> ${escapeHtml(payment.refund_reason)}</p>` : ''}${payment.void_reason ? `<p style="margin-top:14px;color:#64748b"><strong>Void reason:</strong> ${escapeHtml(payment.void_reason)}</p>` : ''}<p class="footer">${escapeHtml(clinicSettings.receipt_footer || 'Thank you. Please keep this receipt for your records.')}</p></body></html>`)
  popup.document.close()
  popup.focus()
  popup.onload = () => popup.print()
  return true
}
