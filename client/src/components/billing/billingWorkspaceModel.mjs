// Central view-only filter mapping; the server remains authoritative for status and totals.
export const PENDING_BILL_STATUSES = 'draft,pending,ready,partially_paid'
export const normalizedBillingTab = value => ['history', 'transactions', 'receipts', 'cash'].includes(value) ? 'history' : 'payments'
export const statusQueryFor = (section, status) => section === 'history' ? '' : status === 'failed' ? 'payment_failed' : status === 'paid' ? 'paid' : PENDING_BILL_STATUSES
