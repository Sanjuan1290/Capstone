import { Link, useLocation } from 'react-router-dom'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { MdDashboard, MdReceiptLong, MdApproval, MdPointOfSale, MdFactCheck } from 'react-icons/md'

const ITEMS = [
  { label: 'Checkout', path: '/admin/billing?tab=checkout', icon: MdPointOfSale, tab: 'checkout' },
  { label: 'Overview', path: '/admin/billing?tab=overview', icon: MdDashboard, tab: 'overview' },
  { label: 'Transactions', path: '/admin/billing/transactions', icon: MdReceiptLong, route: '/admin/billing/transactions' },
  { label: 'Adjustment Requests', path: '/admin/billing/approvals', icon: MdApproval, route: '/admin/billing/approvals' },
  { label: 'Daily Cash Reconciliation', path: '/admin/billing/reconciliation', icon: MdFactCheck, route: '/admin/billing/reconciliation' },
]

const AdminBillingNav = ({ pendingAdjustments = 0, pendingApprovals = 0 }) => {
  const location = useLocation()
  const queryTab = new URLSearchParams(location.search).get('tab') || 'checkout'
  const currentPath = location.pathname.replace(/^\/superadmin\/branches\/\d+(?=\/|$)/, '/admin')
  const pending = Number(pendingAdjustments || pendingApprovals || 0)

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.tab
            ? currentPath === '/admin/billing' && queryTab === item.tab
            : currentPath.startsWith(item.route)
          return (
            <Link
              key={item.path}
              to={branchPortalPath(item.path, location.pathname)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${active ? 'bg-[#0b1a2c] text-amber-400' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              <Icon className="text-lg" />
              <span>{item.label}</span>
              {item.label === 'Adjustment Requests' && pending > 0 && (
                <span className="min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c]">{pending > 99 ? '99+' : pending}</span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default AdminBillingNav
