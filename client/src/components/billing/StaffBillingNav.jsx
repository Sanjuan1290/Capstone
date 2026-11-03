import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import { staffBillingBasePath, staffBillingVisibleTabs } from '../../utils/staffBillingAccess.mjs'
import { MdPointOfSale, MdReceiptLong, MdWarningAmber, MdFactCheck, MdExpandMore, MdDashboard } from 'react-icons/md'

// Use the same task layout as Admin Billing while retaining Staff permissions.
const TASKS = [
  { tab: 'checkout', label: 'Take Payment', description: 'Patient checkout', icon: MdPointOfSale, permission: 'checkout' },
  { tab: 'transactions', label: 'Bills & Receipts', description: 'Find past bills', icon: MdReceiptLong },
  { tab: 'payment-issues', label: 'Payment Problems', description: 'Check QR status', icon: MdWarningAmber, permission: 'checkout' },
  { tab: 'cash', label: 'End-of-Day Cash', description: 'Count the drawer', icon: MdFactCheck, permission: 'checkout' },
]

export default function StaffBillingNav({ activeTab }) {
  const { user } = useAuth()
  const location = useLocation()
  const canCheckout = hasStaffPermission(user, 'checkout')
  const canBilling = hasStaffPermission(user, 'billing')
  const canReports = hasStaffPermission(user, 'reports')
  const base = staffBillingBasePath({ checkout: canCheckout })
  const visibleTabs = staffBillingVisibleTabs({ checkout: canCheckout, billing: canBilling })
  const visible = TASKS.filter(item => visibleTabs.includes(item.tab))
  return (
    <nav aria-label="Billing tasks" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map(({ tab, label, description, icon: Icon }) => (
          <Link key={tab} to={`${base}?tab=${tab}`} aria-current={activeTab === tab ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${activeTab === tab ? 'border-slate-950 bg-[#0b1a2c] text-white' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'}`}>
            <Icon className="shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0"><span className="block">{label}</span><span className={`block text-[11px] font-normal ${activeTab === tab ? 'text-slate-200' : 'text-slate-500'}`}>{description}</span></span>
          </Link>
        ))}
      </div>
      {canReports && (
        <details className="group mt-1 border-t border-slate-100 pt-1">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <MdExpandMore className="text-lg transition-transform group-open:rotate-180" aria-hidden="true" /> More billing tools
          </summary>
          <Link to="/staff/reports" state={{ from: location.pathname }} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MdDashboard /> Reports</Link>
        </details>
      )}
    </nav>
  )
}
