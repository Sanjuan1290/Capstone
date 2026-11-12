import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MdClose, MdPayments, MdRefresh, MdSearch } from 'react-icons/md'
import { getAdminCheckoutBills, getMyCashierClosing, closeMyCashier } from '../../services/admin.service'
import CashierDrawerCard from '../../components/billing/CashierDrawerCard'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney } from '../../utils/billingUi'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'

const TABS = [
  { value: 'ready', label: 'Ready for Payment', countKey: 'ready' },
  { value: 'draft,pending', label: 'Check Bill First', countKey: 'draft' },
  { value: 'partially_paid', label: 'Remaining Balances', countKey: 'partially_paid' },
]

const Admin_Checkout = ({ embedded = false }) => {
  const toast = useToast()
  const location = useLocation()
  const portalPath = (path) => branchPortalPath(path, location.pathname)
  const [filter,setFilter]=useState('ready'),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10)
  const [data,setData]=useState({items:[],summary:{},pagination:{page:1,total:0,totalPages:1}}),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=async()=>{setLoading(true);setError('');try{setData(await getAdminCheckoutBills({status:filter,search,page,limit:pageSize}))}catch(err){setError(err.message||'Checkout queue could not be loaded.');toast.error(err.message||'Checkout queue could not be loaded.')}finally{setLoading(false)}}
  useEffect(()=>{const timer=window.setTimeout(load,search?300:0);return()=>window.clearTimeout(timer)},[filter,search,page,pageSize]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const refresh=()=>load();window.addEventListener('clinic:refresh',refresh);return()=>window.removeEventListener('clinic:refresh',refresh)}) // eslint-disable-line react-hooks/exhaustive-deps
  const items=Array.isArray(data?.items)?data.items:[],summary=data?.summary||{},pagination=data?.pagination||{}
  return <div className={`${embedded ? 'w-full' : 'mx-auto w-full max-w-6xl'} space-y-5`}>
    {embedded ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Choose a patient to collect payment</h2><p className="mt-1 text-sm text-slate-500">Start with Ready for Payment. If charges are not confirmed, open Check Bill First.</p></div><></></div> : <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500"/> Checkout</h1><p className="mt-1 text-sm text-slate-500">Administrators can perform the complete patient checkout workflow, including direct audited adjustments.</p></div><></></div>}
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
      {['1. Find the patient', '2. Check and confirm charges', '3. Collect payment and issue receipt'].map(label => <p key={label} className="font-semibold text-slate-700">{label}</p>)}
    </div>
    <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <summary className="min-h-10 cursor-pointer list-item px-2 py-2 text-sm font-semibold text-slate-800">Cash drawer & end-of-shift count <span className="ml-2 font-normal text-slate-500">(open when needed)</span></summary>
      <div className="pt-2"><CashierDrawerCard loadDrawer={getMyCashierClosing} closeDrawer={closeMyCashier} /></div>
    </details>
    <div className="grid gap-3 sm:grid-cols-3">{TABS.map(tab=><button key={tab.value} onClick={()=>{setFilter(tab.value);setPage(1)}} className={`rounded-2xl border p-4 text-left shadow-sm ${filter===tab.value?'border-amber-300 bg-amber-50':'border-slate-200 bg-white'}`}><p className={`text-xs font-black uppercase tracking-wide ${filter===tab.value?'text-amber-700':'text-slate-400'}`}>{tab.label}</p><p className="mt-2 text-2xl font-black text-slate-900">{Number(summary[tab.countKey]||0)}</p></button>)}</div>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="form-control pl-10 pr-10" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1)}} placeholder="Search patient, doctor, reason, or bill number..."/>{search&&<button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={()=>setSearch('')}><MdClose/></button>}</div></div>
      {loading?<div className="p-5"><LoadingState label="Loading checkout queue..."/></div>:error?<div className="p-5"><ErrorState message={error} onRetry={load}/></div>:!items.length?<div className="p-5"><EmptyState title="No bills in this section" description="No bills match this checkout stage."/></div>:<div className="divide-y divide-slate-100">{items.map(bill=><Link key={bill.id} to={portalPath(`/admin/billing/checkout/${bill.id}`)} className="block p-5 hover:bg-slate-50"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-900">{bill.patient_name}</h2><BillingStatusBadge status={bill.status}/></div><p className="mt-1 text-sm text-slate-500">{bill.doctor_name} · {bill.appointment_reason||'Consultation'}</p><p className="mt-2 text-xs font-semibold text-slate-400">{bill.appointment_date||'—'} · {bill.appointment_time||'—'} · Bill #{bill.id}</p></div><div className="text-right"><p className="text-xs font-bold uppercase text-slate-400">{bill.status==='partially_paid'?'Balance':bill.status==='paid'?'Paid':'Amount'}</p><p className="mt-1 text-xl font-black text-slate-900">{formatMoney(bill.status==='partially_paid'?bill.balance_amount:bill.total_amount)}</p><p className="mt-2 text-xs font-bold text-amber-700">View Bill & Continue →</p></div></div></Link>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4"><Link to={portalPath('/admin/billing/transactions?status=paid')} className="text-sm font-semibold text-sky-700 hover:underline">Find completed bills & receipts →</Link><Pagination page={pagination.page||page} totalPages={pagination.totalPages||1} pageSize={pageSize} total={pagination.total||0} onPageChange={setPage} onPageSizeChange={(size)=>{setPageSize(size);setPage(1)}}/></div>
    </section>
  </div>
}
export default Admin_Checkout
