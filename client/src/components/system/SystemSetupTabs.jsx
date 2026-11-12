import { Link, useLocation } from 'react-router-dom'
import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'
import {
  MdCategory, MdEventBusy, MdLocalShipping, MdMeetingRoom, MdPayments, MdSettings, MdSwapVert, MdPin,
} from 'react-icons/md'

export const SYSTEM_SETUP_TABS = [
  { key: 'visits', label: 'Patient Visits', Icon: MdSettings, suffix: '/system-setup' },
  { key: 'cancellation_reasons', label: 'Reason for Cancellation', Icon: MdEventBusy, suffix: '/system-setup?tab=cancellation_reasons' },
  { key: 'billing_setup', label: 'Services & Pricing Setup', Icon: MdPayments, suffix: '/system-setup/billing/services' },
  { key: 'service_categories', label: 'Service Categories', Icon: MdCategory, suffix: '/system-setup?tab=service_categories' },
  { key: 'suppliers', label: 'Suppliers', Icon: MdLocalShipping, suffix: '/system-setup?tab=suppliers' },
  { key: 'stock_rooms', label: 'Stock Rooms', Icon: MdMeetingRoom, suffix: '/system-setup?tab=stock_rooms' },
  { key: 'queue_security', label: 'Queue Display Security', Icon: MdPin, suffix: '/system-setup?tab=queue_security' },
  { key: 'movement_reasons', label: 'Movement Reasons', Icon: MdSwapVert, suffix: '/system-setup?tab=movement_reasons' },
]

const SystemSetupTabs = () => {
  const location = useLocation()
  const base = portalBaseForPath(location.pathname)
  const requestedTab = new URLSearchParams(location.search).get('tab')
  const activeKey = location.pathname.includes('/system-setup/billing') ? 'billing_setup' : (SYSTEM_SETUP_TABS.some((tab) => tab.key === requestedTab) ? requestedTab : 'visits')

  return (
    <nav aria-label="System Setup sections" className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
      <div className="flex w-max min-w-full items-center gap-2">
        {SYSTEM_SETUP_TABS.map(({ key, label, Icon, suffix }) => (
          <Link key={key} to={`${base}${suffix}`} aria-current={activeKey === key ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeKey === key ? 'bg-[#0b1a2c] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icon aria-hidden="true" /> {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default SystemSetupTabs

