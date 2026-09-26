export const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0)

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

export const ADMIN_BILL_STATUS = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  pending: { label: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Ready', tone: 'bg-amber-50 text-amber-700' },
  partially_paid: { label: 'Partially Paid', tone: 'bg-sky-50 text-sky-700' },
  paid: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700' },
  voided: { label: 'Voided', tone: 'bg-rose-50 text-rose-700' },
  refunded: { label: 'Refunded', tone: 'bg-violet-50 text-violet-700' },
}

export const STAFF_BILL_STATUS = {
  draft: { label: 'Needs Review', tone: 'bg-slate-100 text-slate-700' },
  pending: { label: 'Needs Review', tone: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Ready to Collect', tone: 'bg-sky-50 text-sky-700' },
  partially_paid: { label: 'Balance Remaining', tone: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Completed', tone: 'bg-emerald-50 text-emerald-700' },
  voided: { label: 'Voided', tone: 'bg-rose-50 text-rose-700' },
  refunded: { label: 'Refunded', tone: 'bg-violet-50 text-violet-700' },
}

export const paymentMethodLabel = (method) => ({
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
}[method] || String(method || '').replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()))

export const enabledPaymentMethods = (settings = {}) => [
  { value: 'cash', label: 'Cash', enabled: settings.cash_enabled !== 0 && settings.cash_enabled !== false },
  { value: 'gcash', label: 'GCash', enabled: settings.gcash_enabled !== 0 && settings.gcash_enabled !== false },
  { value: 'maya', label: 'Maya', enabled: settings.maya_enabled !== 0 && settings.maya_enabled !== false },
  { value: 'bank_transfer', label: 'Bank Transfer', enabled: settings.bank_transfer_enabled !== 0 && settings.bank_transfer_enabled !== false },
].filter((method) => method.enabled)
