import { NavLink, useLocation } from 'react-router-dom'
import { MdMedicalServices, MdPayments, MdDiscount, MdReceiptLong } from 'react-icons/md'

const ITEMS = [
  { label: 'Services & Pricing', suffix: '/system-setup/billing/services', icon: MdMedicalServices },
  { label: 'Payment Methods', suffix: '/system-setup/billing/payment-methods', icon: MdPayments },
  { label: 'Discounts', suffix: '/system-setup/billing/discounts', icon: MdDiscount },
  { label: 'Receipt', suffix: '/system-setup/billing/receipt', icon: MdReceiptLong },
]

const BillingSetupNav = () => {
  const location = useLocation()
  const base = location.pathname.startsWith('/staff') ? '/staff' : '/admin'
  return (
    <div className="overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max gap-6 px-1">
        {ITEMS.map((item) => {
          const path = `${base}${item.suffix}`
          const Icon = item.icon
          const active = location.pathname.startsWith(path)
          return <NavLink key={path} to={path} className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold ${active ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon className="text-lg" /> {item.label}</NavLink>
        })}
      </div>
    </div>
  )
}
export default BillingSetupNav
