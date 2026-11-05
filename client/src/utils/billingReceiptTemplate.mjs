/** Shared, print-only A5 payment receipt. Keep monetary values from the saved bill ledger. */
const money = value => new Intl.NumberFormat('en-PH', {style:'currency', currency:'PHP'}).format(Number(value) || 0)
const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0
const cents = value => Math.round((asNumber(value) + Number.EPSILON) * 100) / 100
const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
const visible = value => {
  const s = String(value ?? '').trim()
  return s && !/^(?:n\/?a|none|null|undefined|not provided|not available|—|-)$/i.test(s) ? s : ''
}
const methodName = method => ({ cash:'Cash', gcash:'GCash', maya:'Maya', bank_transfer:'Bank Transfer', qrph:'QR Ph' }[method] || String(method || '').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))
const dateInManila = raw => {
  if (!raw) return '—'
  // Database DATETIME without an offset represents clinic-local Philippine time.
  const source = typeof raw === 'string' && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(raw)
    ? raw.trim().replace(' ','T') + (raw.trim().split(':').length === 2 ? ':00' : '') + '+08:00'
    : raw
  const date = new Date(source)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-PH', {
    timeZone:'Asia/Manila', year:'numeric',month:'short',day:'numeric',
    hour:'numeric',minute:'2-digit',hour12:true
  }).format(date) + ' PHT'
}
const line = (label,value,extraClass='') => `<div class="amount-row ${extraClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(money(value))}</strong></div>`
const metadata = (label,value) => visible(value) ? `<div class="detail"><span class="detail-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>` : ''
const adjustmentRow = (label,amount) => `<div class="amount-row discount"><span>${escapeHtml(label)}</span><strong>−${escapeHtml(money(amount))}</strong></div>`

export const getReceiptBreakdown = bill => {
  const subtotal = cents(Math.max(0,asNumber(bill?.subtotal)))
  const discount = cents(Math.max(0,asNumber(bill?.discount_amount)))
  const promotion = Math.min(discount,cents(Math.max(0,asNumber(bill?.promotion_discount_amount ?? bill?.selected_promotion?.applied_discount_amount))))
  const courtesy = Math.min(cents(discount - promotion),cents(Math.max(0,asNumber(bill?.approved_courtesy_discount))))
  // Do not infer an amount for an individual legacy adjustment from its label.
  const other = cents(Math.max(0,discount - promotion - courtesy))
  return {subtotal,discount,promotion,courtesy,other}
}

const receiptState = (bill,payment) => {
  const status = String(payment?.status || '').toLowerCase()
  if (status === 'voided') return {label:'VOIDED',klass:'void'}
  const amount = Math.max(0,asNumber(payment?.amount))
  const refund = Math.max(0,asNumber(payment?.refund_amount))
  if (refund > 0 && refund + 0.001 >= amount) return {label:'REFUNDED',klass:'refund'}
  if (refund > 0) return {label:'PARTIALLY REFUNDED',klass:'refund'}
  if (status && status !== 'completed') return {label:status.replace(/_/g,' ').toUpperCase(),klass:'muted'}
  if (asNumber(bill?.balance_amount) > 0.009) return {label:'PARTIAL PAYMENT',klass:'partial'}
  return {label:'PAID',klass:'paid'}
}

export function buildBillingReceiptHtml({bill,payment,clinicSettings={},logoUrl='/logo.png'}) {
  if (!bill || !payment) throw new Error('A saved bill and payment are required to print a receipt.')
  const breakdown = getReceiptBreakdown(bill)
  const state = receiptState(bill,payment)
  const originalPayment = Math.max(0,asNumber(payment.amount))
  const refunded = Math.max(0,asNumber(payment.refund_amount))
  const items = Array.isArray(bill.items) ? bill.items : []
  const itemRows = items.map(item=> `<tr><td class="item-name">${escapeHtml(visible(item.service_name) || 'Service / item')}</td><td class="numeric">${escapeHtml(asNumber(item.quantity).toLocaleString('en-PH',{maximumFractionDigits:3}))}</td><td class="numeric">${escapeHtml(money(item.unit_price))}</td><td class="numeric">${escapeHtml(money(item.line_total))}</td></tr>`).join('')
  const promotionLabel = visible(bill.promotion_title_snapshot || bill.selected_promotion?.title_at_booking)
  const title = visible(clinicSettings.receipt_title) || 'PAYMENT RECEIPT'
  const branchName = visible(clinicSettings.branch_name || clinicSettings.clinic_name) || 'Carait Clinic'
  const address = visible(clinicSettings.address)
  const contact = [visible(clinicSettings.phone),visible(clinicSettings.email)].filter(Boolean).join(' · ')
  const miscLabel = breakdown.promotion || breakdown.courtesy ? 'Other discounts' : (visible(bill.discount_label) || 'Discounts & adjustments')
  const adjustments = [
    breakdown.promotion > 0 ? adjustmentRow(`Promotion${promotionLabel ? ` — ${promotionLabel}` : ''}`,breakdown.promotion) : '',
    breakdown.courtesy > 0 ? adjustmentRow('Approved charge reductions',breakdown.courtesy) : '',
    breakdown.other > 0 ? adjustmentRow(miscLabel,breakdown.other) : '',
  ].join('')
  const paymentLines = [
    refunded > 0 ? line('Original payment',originalPayment) : '',
    refunded > 0 ? adjustmentRow('Refunded amount',refunded) : '',
    line(refunded > 0 ? 'Net this payment' : 'This payment', Math.max(0,originalPayment-refunded),'this-payment'),
    line('Paid to date',Math.max(0,asNumber(bill.paid_amount))),
    line('Remaining balance',Math.max(0,asNumber(bill.balance_amount)),'balance'),
  ].join('')
  const secondary = [
    visible(payment.reference_number) ? metadata('Payment reference',payment.reference_number) : '',
    visible(bill.appointment_date) ? metadata('Visit date',bill.appointment_date) : '',
  ].join('')
  const footerText = visible(clinicSettings.receipt_footer) || 'Thank you for visiting Carait Clinic. Please keep this receipt for your records.'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(payment.receipt_number || 'Payment Receipt')}</title><style>
@page{size:A5 portrait;margin:10mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.4;color:#11223a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.receipt{width:100%;max-width:100%;margin:0 auto}.brand{display:flex;align-items:center;gap:11px;border-bottom:2px solid #10243e;padding:0 0 12px;margin-bottom:14px}.logo{width:46px;height:46px;object-fit:contain;flex-shrink:0}.brand-copy{min-width:0}.brand-name{font-size:17pt;line-height:1.1;margin:0;font-weight:800;color:#0b604e}.branch{font-size:10pt;font-weight:700;margin-top:4px}.contact{font-size:8pt;color:#53657b;margin-top:3px;overflow-wrap:anywhere}.receipt-title{font-size:9pt;text-transform:uppercase;letter-spacing:.09em;font-weight:700;margin-top:4px;color:#425569}
.receipt-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.receipt-id{max-width:73%;min-width:0;font-size:9pt;overflow-wrap:anywhere;word-break:break-word}.detail-label{color:#5b6c80;display:block;font-size:8pt;font-weight:400;margin-bottom:2px}.status{border-radius:20px;border:1px solid;font-size:8pt;padding:5px 8px;white-space:nowrap;font-weight:800;letter-spacing:.02em}.paid{color:#007c5c;border-color:#87cbb6}.partial{color:#8b6200;border-color:#ddb96c}.refund{color:#7140a5;border-color:#bba2db}.void{color:#ae203e;border-color:#dcb1b9}.muted{color:#516174;border-color:#a8b1bd}
.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;row-gap:10px;padding:12px 0;border-top:1px solid #d8e0e9;border-bottom:1px solid #d8e0e9}.detail{min-width:0;overflow-wrap:anywhere;font-size:9pt}.detail strong{font-weight:700}.detail.wide{grid-column:1/-1}
.section-heading{font-size:10pt;margin:17px 0 8px;font-weight:800}.items{border-collapse:collapse;table-layout:fixed;width:100%;font-size:8.6pt}.items th{text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.035em;color:#506178;border-bottom:1px solid #aab7c6;padding:7px 5px}.items td{padding:8px 5px;border-bottom:1px solid #e6eaf0;vertical-align:top}.items th:first-child,.items td:first-child{padding-left:0}.items th:last-child,.items td:last-child{padding-right:0}.items .numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.item-name{overflow-wrap:anywhere}.items thead{display:table-header-group}.items tr{break-inside:avoid;page-break-inside:avoid}
.amounts{margin-top:14px;max-width:100%;padding-top:5px;border-top:1px solid #d8e0e9}.amount-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:6px 0;font-size:9pt}.amount-row span{min-width:0;overflow-wrap:anywhere}.amount-row strong{white-space:nowrap;font-variant-numeric:tabular-nums}.discount strong{color:#007b59}.bill-total{border-top:2px solid #12253f;margin-top:10px;padding-top:10px;font-size:14pt;font-weight:800}.payment-summary{border:1px solid #cfdae6;border-radius:8px;margin-top:14px;padding:11px 13px;break-inside:avoid}.payment-summary h2{font-size:9pt;margin:0 0 7px;text-transform:uppercase;letter-spacing:.05em}.payment-summary .amount-row{margin:5px 0}.payment-summary .balance{padding-top:6px;border-top:1px solid #dce4ed;font-weight:800}.this-payment{font-weight:800}
.note{color:#53657b;font-size:8pt;margin-top:12px;overflow-wrap:anywhere}.foot{border-top:1px solid #d8e0e9;margin-top:23px;padding-top:11px;text-align:center;font-size:8.5pt;color:#53657b;break-inside:avoid;white-space:pre-wrap;overflow-wrap:anywhere}.foot strong{color:#253d55}
@media screen{body{padding:18px;max-width:560px;margin:auto;box-shadow:0 1px 10px #d8e0e9}}@media print{body{padding:0;box-shadow:none;max-width:none}.receipt{margin:0} }
</style></head><body><main class="receipt">
<header class="brand"><img class="logo" src="${escapeHtml(logoUrl)}" alt="Carait Clinic logo"><div class="brand-copy"><h1 class="brand-name">CARAIT CLINIC</h1><div class="branch">${escapeHtml(branchName)}</div>${address ? `<div class="contact">${escapeHtml(address)}</div>` : ''}${contact ? `<div class="contact">${escapeHtml(contact)}</div>` : ''}<div class="receipt-title">${escapeHtml(title)}</div></div></header>
<div class="receipt-top"><div class="receipt-id"><span class="detail-label">Receipt number</span><strong>${escapeHtml(payment.receipt_number || '—')}</strong></div><span class="status ${state.klass}">${escapeHtml(state.label)}</span></div>
<section class="details" aria-label="Payment information">${metadata('Payment date',dateInManila(payment.paid_at))}${metadata('Payment method',methodName(payment.payment_method))}${metadata('Patient',bill.patient_name)}${metadata('Doctor',bill.doctor_name)}${metadata('Bill number',bill.id)}${secondary}</section>
<h2 class="section-heading">Services &amp; Charges</h2>
<table class="items"><colgroup><col style="width:45%"><col style="width:10%"><col style="width:22%"><col style="width:23%"></colgroup><thead><tr><th>Item</th><th class="numeric">Qty</th><th class="numeric">Unit Price</th><th class="numeric">Amount</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">No line items recorded.</td></tr>'}</tbody></table>
<section class="amounts" aria-label="Bill calculations">${line('Subtotal',breakdown.subtotal)}${adjustments}<div class="amount-row bill-total"><span>Bill Total</span><strong>${escapeHtml(money(bill.total_amount))}</strong></div></section>
<section class="payment-summary" aria-label="Payment summary"><h2>Payment Summary</h2>${paymentLines}</section>
${payment.refund_reason ? `<p class="note"><strong>Refund reason:</strong> ${escapeHtml(payment.refund_reason)}</p>` : ''}${payment.void_reason ? `<p class="note"><strong>Void reason:</strong> ${escapeHtml(payment.void_reason)}</p>` : ''}
<footer class="foot"><strong>${escapeHtml(footerText)}</strong></footer>
</main></body></html>`
}
