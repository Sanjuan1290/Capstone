import { ADMIN_BILL_STATUS, STAFF_BILL_STATUS } from '../../utils/billingUi'

const BillingStatusBadge = ({ status, audience = 'admin' }) => {
  const map = audience === 'staff' ? STAFF_BILL_STATUS : ADMIN_BILL_STATUS
  const meta = map[status] || { label: String(status || 'Unknown'), tone: 'bg-slate-100 text-slate-600' }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${meta.tone}`}>{meta.label}</span>
}

export default BillingStatusBadge
