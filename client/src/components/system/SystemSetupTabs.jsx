import { Link, useLocation } from 'react-router-dom'
import {
  MdCategory, MdCampaign, MdEventBusy, MdLocalShipping, MdMeetingRoom, MdPayments, MdPlace, MdSettings, MdSwapVert,
} from 'react-icons/md'

export const SYSTEM_SETUP_TABS = [
  { key: 'visits', label: 'Patient Visits', Icon: MdSettings, suffix: '/system-setup' },
  { key: 'cancellation_reasons', label: 'Reason for Cancellation', Icon: MdEventBusy, suffix: '/system-setup?tab=cancellation_reasons' },
  { key: 'billing_setup', label: 'Services & Pricing Setup', Icon: MdPayments, suffix: '/system-setup/billing/services' },
  { key: 'promotions', label: 'Promotions', Icon: MdCampaign, suffix: '/system-setup?tab=promotions' },
  { key: 'service_categories', label: 'Service Categories', Icon: MdCategory, suffix: '/system-setup?tab=service_categories' },
  { key: 'suppliers', label: 'Suppliers', Icon: MdLocalShipping, suffix: '/system-setup?tab=suppliers' },
  { key: 'location_types', label: 'Storage Locations', Icon: MdPlace, suffix: '/system-setup?tab=location_types' },
  { key: 'stock_rooms', label: 'Stock Rooms', Icon: MdMeetingRoom, suffix: '/system-setup?tab=stock_rooms' },
  { key: 'movement_reasons', label: 'Movement Reasons', Icon: MdSwapVert, suffix: '/system-setup?tab=movement_reasons' },
]

const SystemSetupTabs = () => {
  const location = useLocation()
  const base = location.pathname.startsWith('/staff') ? '/staff' : '/admin'
  const requestedTab = new URLSearchParams(location.search).get('tab')
  const activeKey = location.pathname.includes('/system-setup/billing') ? 'billing_setup' : (SYSTEM_SETUP_TABS.some((tab) => tab.key === requestedTab) ? requestedTab : 'visits')

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      {SYSTEM_SETUP_TABS.filter((item) => base === '/admin' || item.key !== 'promotions').map(({ key, label, Icon, suffix }) => (
        <Link key={key} to={`${base}${suffix}`} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeKey === key ? 'bg-[#0b1a2c] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Icon /> {label}
        </Link>
      ))}
    </div>
  )
}

export default SystemSetupTabs





