// Staff Billing is a shared UI, not a permission grant. The server remains
// authoritative on Checkout and Billing API access.
export const STAFF_BILLING_TABS = Object.freeze(['checkout', 'transactions', 'payment-issues', 'cash'])

export const staffBillingBasePath = ({ checkout = false } = {}) => checkout ? '/staff/checkout' : '/staff/billing'

export function resolveStaffBillingTab(requested, { checkout = false, billing = false } = {}) {
  if (!checkout && !billing) return null
  if (requested === 'transactions') return 'transactions' // Both permissions allow read-only bill listing.
  if (checkout && STAFF_BILLING_TABS.includes(requested)) return requested
  return checkout ? 'checkout' : 'transactions'
}

export function staffBillingVisibleTabs({ checkout = false, billing = false } = {}) {
  if (!checkout && !billing) return []
  return checkout ? [...STAFF_BILLING_TABS] : ['transactions']
}
