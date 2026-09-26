import { Link, useLocation } from 'react-router-dom'
import { MdDashboard, MdReceiptLong, MdApproval, MdPointOfSale } from 'react-icons/md'

const ITEMS = [
  { label: 'Checkout', path: '/admin/billing?tab=checkout', icon: MdPointOfSale, tab: 'checkout' },
  { label: 'Overview', path: '/admin/billing?tab=overview', icon: MdDashboard, tab: 'overview' },
  { label: 'Transactions', path: '/admin/billing/transactions', icon: MdReceiptLong, route: '/admin/billing/transactions' },
  { label: 'Adjustments', path: '/admin/billing/adjustments', icon: MdApproval, route: '/admin/billing/adjustments' },
]

const AdminBillingNav = ({ pendingAdjustments = 0, pendingApprovals = 0 }) => {
  const location = useLocation()
  const queryTab = new URLSearchParams(location.search).get('tab') || 'checkout'
  const pending = Number(pendingAdjustments || pendingApprovals || 0)

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.tab
            ? location.pathname === '/admin/billing' && queryTab === item.tab
            : location.pathname.startsWith(item.route)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${active ? 'bg-[#0b1a2c] text-amber-400' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              <Icon className="text-lg" />
              <span>{item.label}</span>
              {item.label === 'Adjustments' && pending > 0 && (
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
