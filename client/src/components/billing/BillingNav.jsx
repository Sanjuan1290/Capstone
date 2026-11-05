import {useState} from 'react'
import {useAuth} from '../../context/AuthContext'
import {hasStaffPermission} from '../../config/staffPermissions'
import {Link,useLocation,useOutletContext} from 'react-router-dom'
import {billingPortal} from '../../utils/billingPortal.mjs'
import StaffCashDrawer from './StaffCashDrawer'
export default function BillingNav({activeTab}) {
 const location=useLocation(),portal=billingPortal(location.pathname)
 const {user}=useAuth(),context=useOutletContext()||{}
 const [toolsOpen,setToolsOpen]=useState(false)
 const permissions=context.permissions||user?.permissions||[]
 const canManageBilling=portal.admin&&(portal.superadmin||permissions.includes('billing'))
 const canSetup=portal.admin&&(portal.superadmin||permissions.includes('system_setup'))
 const canOwnCash=!portal.admin&&hasStaffPermission(user,'checkout')
 const home=`${portal.base}/${portal.admin?'billing':hasStaffPermission(user,'checkout')?'checkout':'billing'}`
 const history=activeTab==='history'||location.pathname.includes('/transactions')||location.pathname.includes('/history/')
 const tools=[...(canManageBilling?[['billing/reconciliation','Reconciliation & End-of-Day Cash'],['billing/payment-issues','Payment Troubleshooting'],['billing/approvals','Additional Discount Approvals']]:[]),...(canSetup?[['system-setup/billing/services','Billing Setup']]:[])]
 return <nav aria-label="Billing" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
  <div className="flex gap-2">{[['payments','Payments'],['history','Receipts & History']].map(([id,label])=><Link key={id} to={`${home}?tab=${id}`} aria-current={(id==='history'?history:!history)?'page':undefined} className={`rounded-xl px-4 py-3 text-sm font-bold ${(id==='history'?history:!history)?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>)}</div>
  {(canManageBilling||canOwnCash||canSetup)&&<details className="mt-2 border-t border-slate-100 pt-2" onToggle={event=>setToolsOpen(event.currentTarget.open)}>
   <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-600">Admin Tools</summary>
   {tools.length>0&&<div className="flex flex-wrap gap-2 p-2">{tools.map(([path,label])=><Link key={path} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" to={`${portal.base}/${path}`}>{label}</Link>)}</div>}
   {canOwnCash&&toolsOpen&&<section className="p-3"><h2 className="mb-3 text-sm font-bold">Your End-of-Day Cash Drawer</h2><p className="mb-3 text-xs text-slate-500">Count and close your own drawer. An administrator must reopen a closed drawer.</p><StaffCashDrawer/></section>}
  </details>}
 </nav>
}
