import { NavLink, useLocation } from 'react-router-dom'
import { MdMedicalServices, MdPayments, MdDiscount, MdReceiptLong } from 'react-icons/md'

const ITEMS = [
  { label: 'Services & Pricing', path: '/admin/billing/setup/services', icon: MdMedicalServices },
  { label: 'Payment Methods', path: '/admin/billing/setup/payment-methods', icon: MdPayments },
  { label: 'Discounts', path: '/admin/billing/setup/discounts', icon: MdDiscount },
  { label: 'Receipt', path: '/admin/billing/setup/receipt', icon: MdReceiptLong },
]

const BillingSetupNav = () => {
  const location = useLocation()
  return (
    <div className="overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max gap-6 px-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = location.pathname.startsWith(item.path)
          return (
            <NavLink key={item.path} to={item.path} className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold ${active ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <Icon className="text-lg" /> {item.label}
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

export default BillingSetupNav
