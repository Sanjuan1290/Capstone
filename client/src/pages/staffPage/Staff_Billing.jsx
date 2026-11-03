import { useLocation, useSearchParams } from 'react-router-dom'
import { MdPayments } from 'react-icons/md'
import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import StaffBillingNav from '../../components/billing/StaffBillingNav'
import StaffCashDrawer from '../../components/billing/StaffCashDrawer'
import StaffBillingQrLookup from '../../components/billing/StaffBillingQrLookup'
import StaffCheckoutQueue from './StaffCheckoutQueue'
import Staff_BillingRecords from './Staff_BillingRecords'
import { resolveStaffBillingTab } from '../../utils/staffBillingAccess.mjs'

// Both legacy Staff URLs keep working. Staff actions remain role-restricted.

export default function Staff_Billing() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const canCheckout = hasStaffPermission(user, 'checkout')
  const canBilling = hasStaffPermission(user, 'billing')
  const requestedTab = searchParams.get('tab') || (location.pathname === '/staff/billing' ? 'transactions' : null)
  const activeTab = resolveStaffBillingTab(requestedTab, { checkout: canCheckout, billing: canBilling })

  if (!canCheckout && !canBilling) {
    return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Your account does not have billing access.</p>
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Find a patient, review their bill, collect permitted payments, and print receipts. Other billing tasks are in the menu below.</p>
      </header>
      <StaffBillingNav activeTab={activeTab} />
      {activeTab === 'checkout' && canCheckout && <StaffCheckoutQueue />}
      {activeTab === 'transactions' && <Staff_BillingRecords embedded canCheckout={canCheckout} />}
      {activeTab === 'payment-issues' && canCheckout && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <h2 className="font-bold">Check a payment problem</h2>
            <p className="mt-1">Find the patient's bill below. Open Checkout to review its QR Ph payment status or continue an unpaid balance. Payment refunds, voids, and disputed transactions require an Administrator.</p>
            <p className="mt-1 text-xs">This is a bill lookup, not a list of confirmed failed payments. A pending or partial bill does not necessarily indicate a QR error.</p>
          </div>
          <StaffBillingQrLookup />
          <Staff_BillingRecords embedded canCheckout={canCheckout} paymentHelp />
        </section>
      )}
      {activeTab === 'cash' && canCheckout && (
        <section className="space-y-3">
          <div><h2 className="text-lg font-bold text-slate-900">End-of-Day Cash</h2><p className="text-sm text-slate-500">Count and close your own cashier drawer. An Administrator must reopen a closed drawer.</p></div>
          <StaffCashDrawer />
        </section>
      )}
    </div>
  )
}
