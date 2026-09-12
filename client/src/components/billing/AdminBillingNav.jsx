import { NavLink, useLocation } from 'react-router-dom'
import { MdDashboard, MdReceiptLong, MdApproval, MdAccountBalanceWallet, MdSettings } from 'react-icons/md'

const ITEMS = [
  { label: 'Overview', path: '/admin/billing', icon: MdDashboard, exact: true },
  { label: 'Transactions', path: '/admin/billing/transactions', icon: MdReceiptLong },
  { label: 'Approvals', path: '/admin/billing/approvals', icon: MdApproval },
  { label: 'Reconciliation', path: '/admin/billing/reconciliation', icon: MdAccountBalanceWallet },
  { label: 'Setup', path: '/admin/billing/setup/services', icon: MdSettings, setup: true },
]

const AdminBillingNav = ({ pendingApprovals = 0 }) => {
  const location = useLocation()
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.exact
            ? location.pathname === item.path
            : item.setup
              ? location.pathname.startsWith('/admin/billing/setup')
              : location.pathname.startsWith(item.path)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${active ? 'bg-[#0b1a2c] text-amber-400' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              <Icon className="text-lg" />
              <span>{item.label}</span>
              {item.label === 'Approvals' && Number(pendingApprovals) > 0 && (
                <span className="min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c]">{pendingApprovals > 99 ? '99+' : pendingApprovals}</span>
              )}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

export default AdminBillingNav
