import { Link, useLocation } from 'react-router-dom'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { MdReceiptLong, MdApproval, MdPointOfSale, MdFactCheck, MdWarningAmber, MdDashboard, MdExpandMore } from 'react-icons/md'

// Keep every existing route; show only the actions clinic staff use most often.
const MAIN = [
  { label: 'Take Payment', description: 'Patient checkout', path: '/admin/billing?tab=checkout', icon: MdPointOfSale, tab: 'checkout' },
  { label: 'Bills & Receipts', description: 'Find past bills', path: '/admin/billing/transactions', icon: MdReceiptLong, route: '/admin/billing/transactions' },
  { label: 'Payment Problems', description: 'Check QR status', path: '/admin/billing/payment-issues', icon: MdWarningAmber, route: '/admin/billing/payment-issues' },
  { label: 'End-of-Day Cash', description: 'Count the drawer', path: '/admin/billing/reconciliation', icon: MdFactCheck, route: '/admin/billing/reconciliation' },
]
const MORE = [
  { label: 'Summary & Reports', path: '/admin/billing?tab=overview', icon: MdDashboard, tab: 'overview' },
  { label: 'Approve Requests', path: '/admin/billing/approvals', icon: MdApproval, route: '/admin/billing/approvals' },
]

const AdminBillingNav = ({ pendingAdjustments = 0, pendingApprovals = 0 }) => {
  const location = useLocation()
  const currentPath = location.pathname.replace(/^\/superadmin\/branches\/\d+(?=\/|$)/, '/admin')
  const queryTab = new URLSearchParams(location.search).get('tab') || 'checkout'
  const pending = Number(pendingAdjustments || pendingApprovals || 0)
  const active = item => item.tab
    ? (currentPath === '/admin/billing' && queryTab === item.tab) || (item.tab === 'checkout' && currentPath.startsWith('/admin/billing/checkout/'))
    : currentPath.startsWith(item.route)
  const entry = (item, compact = false) => {
    const Icon = item.icon
    const selected = active(item)
    return <Link key={item.path} to={branchPortalPath(item.path, location.pathname)} aria-current={selected ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${selected ? 'border-slate-950 bg-[#0b1a2c] text-white' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'}`}>
      <Icon className="shrink-0 text-lg" aria-hidden="true" />
      <span className="min-w-0"><span className="block">{item.label}</span>{!compact && <span className={`block text-[11px] font-normal ${selected ? 'text-slate-200' : 'text-slate-500'}`}>{item.description}</span>}</span>
      {item.route === '/admin/billing/approvals' && pending > 0 && <span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950">{pending}</span>}
    </Link>
  }
  return <nav aria-label="Billing tasks" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
    <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">{MAIN.map(item => entry(item))}</div>
    <details className="group mt-1 border-t border-slate-100 pt-1" open={MORE.some(active) ? true : undefined}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
        <MdExpandMore aria-hidden="true" className="text-lg transition-transform group-open:rotate-180" /> More billing tools
        {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{pending} requests to review</span>}
      </summary>
      <div className="grid gap-1 pb-1 sm:grid-cols-2">{MORE.map(item => entry(item, true))}</div>
    </details>
  </nav>
}
export default AdminBillingNav
