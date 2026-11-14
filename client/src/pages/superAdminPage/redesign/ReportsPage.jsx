import FinancialAllocationReport from '../../../components/billing/FinancialAllocationReport'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {MdPictureAsPdf,MdRefresh,MdCalendarMonth,MdPeople,MdPayments,MdCheckCircle,MdPersonOff,MdInventory2} from 'react-icons/md'
import {LineChart,HorizontalBarChart} from '../../../components/charts/AnalyticsCharts'
import {buildSuperAdminReportHtml,printSuperAdminReport} from '../../../utils/superAdminReportPdf.mjs'
import {fetchJson,Card,PageHead,StatCard,Banner,Loading,Empty,pesos,whole,todayISO,beforeISO,SecondaryButton} from './shared'
import {isValidReportPeriod} from './reportFormat'
import {REPORT_SECTIONS} from './reportPresentation.mjs'
import {useOverviewData} from './Overview'

const money=value=>pesos(value)
const num=value=>Number(value||0)
const label=value=>String(value||'').replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
const toChart=rows=>(rows||[]).map(row=>({label:label(row.name),value:num(row.count)}))
const valueBox=(title,value,description,Icon)=>({title,value,description,Icon})
const DataTable=({columns,rows,empty='No records match the selected filters.'})=>{
 if(!rows?.length)return <Empty title="No report records" description={empty}/>
 return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">{columns.map(c=><th key={c.label} scope="col" className={`whitespace-nowrap px-3 py-3 ${c.right?'text-right':''}`}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||`${index}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{columns.map(col=><td key={col.label} className={`px-3 py-3 ${col.right?'text-right tabular-nums':''}`}>{col.render?col.render(row):row[col.key]??'—'}</td>)}</tr>)}</tbody></table></div>
}
const Cards=({cards})=><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map(({title,value,description,Icon})=><StatCard key={title} label={title} value={value} helper={description} icon={Icon}/>)}</div>
const BranchTable=({branches})=><DataTable columns={[
 {label:'Branch',render:r=><><span className="font-semibold">{r.name}</span>{!Number(r.is_active)&&<span className="ml-2 text-xs text-slate-500">(Inactive)</span>}</>},
 {label:'Appointments',right:true,render:r=>whole(r.appointments)},
 {label:'Completed',right:true,render:r=>whole(r.completed)},
 {label:'Net Billed',right:true,render:r=>money(r.billed)},
 {label:'Net Collected',right:true,render:r=>money(r.collected)},
 {label:'',render:r=><NavLink to={`/superadmin/branches/${r.id}`} className="font-semibold text-amber-700 hover:underline">Manage Branch</NavLink>},
 ]} rows={branches}/>
const BreakdownChart=({rows,title='Activity'})=><Card title={title}><HorizontalBarChart data={toChart(rows).slice(0,12)} /></Card>
const Note=({children})=><p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-slate-700">{children}</p>
function OverviewReport({data,branches,trends,error,refresh}) {
 const t=data.totals||{}
 return <div className="space-y-5">
  <Cards cards={[
   valueBox('Net Collections',money(t.net_collected),'Payments minus voids and refunds',MdPayments),
   valueBox('Appointments',whole(t.appointments),null,MdCalendarMonth),
   valueBox('Completed Visits',whole(t.completed),null,MdCheckCircle),
   valueBox('Unique Patients',whole(t.unique_patients),null,MdPeople),
   valueBox('No-show Rate',`${num(t.no_show_rate).toFixed(1)}%`,'Completed + no-show visits',MdPersonOff),
   valueBox('Outstanding',money(t.outstanding),'Current unpaid balances',MdPayments),
  ]}/>
  <div className="grid gap-5 lg:grid-cols-2">
   <Card title="Appointment Activity" description="Counted by appointment date">{trends===null?<Banner onRetry={refresh}>{error||'Appointment trend could not load.'}</Banner>:<LineChart data={(trends||[]).map(r=>({label:String(r.date).slice(5),value:num(r.appointments)}))} />}</Card>
   <Card title="Net Collections Trend" description="Money received and adjusted during the selected period"><LineChart data={(data.revenue_trend||[]).map(r=>({label:r.month||r.ym,value:num(r.revenue)}))} valueFormatter={money}/></Card>
  </div>
  <div className="grid gap-3 sm:grid-cols-2"><StatCard label="Low Stock (Current)" value={whole(t.low_stock)} icon={MdInventory2}/><StatCard label="Out of Stock (Current)" value={whole(t.out_of_stock)} icon={MdInventory2}/></div>
  {branches.length>1&&<Card title="Branch Comparison" description="Figures reflect the same reporting period"><BranchTable branches={branches}/></Card>}
  <Note>{data.note}</Note>
 </div>
}
function AppointmentReport({data}) {
 const s=data.summary||{}
 return <div className="space-y-5">
  <Cards cards={[
   valueBox('Total Appointments',whole(s.appointments),null,MdCalendarMonth),
   valueBox('Unique Patients',whole(s.unique_patients),null,MdPeople),
   valueBox('New Patients',whole(s.new_patients),'First recorded appointment',MdPeople),
   valueBox('Returning Patients',whole(s.returning_patients),null,MdPeople),
   valueBox('Completed',whole(s.completed),null,MdCheckCircle),
   valueBox('No-show',whole(s.no_show),null,MdPersonOff),
  ]}/>
  <div className="grid gap-5 lg:grid-cols-2"><BreakdownChart title="Appointment Status" rows={data.statuses}/><BreakdownChart title="Booking Sources" rows={data.sources}/></div>
  <Card title="Department Activity"><div className="max-w-3xl"><HorizontalBarChart data={toChart(data.departments)}/></div></Card>
  <Note>{data.note}</Note>
 </div>
}
function FinancialReport({data}) {
 const b=data.billing||{},l=data.collections||{}
 return <div className="space-y-5">
  <Cards cards={[
   valueBox('Gross Billed',money(b.gross_billed),null,MdPayments),
   valueBox('Total Discounts',money(b.discounts),'Includes applied promotions',MdPayments),
   valueBox('Net Billed',money(b.net_billed),null,MdPayments),
   valueBox('Gross Received',money(l.gross_received),'Before adjustments',MdPayments),
   valueBox('Net Collections',money(l.net_collected),'Payments - voids - refunds',MdPayments),
   valueBox('Outstanding',money(data.outstanding),'Current unpaid balances',MdPayments),
  ]}/>
  <div className="grid gap-5 lg:grid-cols-2"><Card title="Revenue by Month"><LineChart data={(data.revenue_trend||[]).map(r=>({label:r.month||r.ym,value:num(r.revenue)}))} valueFormatter={money}/></Card><Card title="Collections by Payment Method"><HorizontalBarChart data={(data.payments_by_method||[]).map(r=>({label:label(r.payment_method),value:num(r.net)}))} valueFormatter={money}/></Card></div>
  <Card title="Payment Breakdown" description="Each amount follows its actual payment, void or refund date"><DataTable columns={[
   {label:'Method',render:r=>label(r.payment_method)},
   {label:'Transactions',right:true,render:r=>whole(r.transactions)},
   {label:'Received',right:true,render:r=>money(r.gross)},
   {label:'Voided',right:true,render:r=>money(r.voided)},
   {label:'Refunded',right:true,render:r=>money(r.refunded)},
   {label:'Net',right:true,render:r=><strong>{money(r.net)}</strong>},
  ]} rows={data.payments_by_method}/></Card>
  <Card title="Promotional Discounts"><div className="grid gap-3 sm:grid-cols-2"><StatCard label="Discounted Bills" value={whole(data.promotions?.promotional_bills)}/><StatCard label="Promotion Savings" value={money(data.promotions?.promotion_savings)}/></div></Card>
  <Note>{data.note}</Note>
 </div>
}
function ServicesReport({data}) {
 return <div className="space-y-5">
  <div className="grid gap-5 lg:grid-cols-2"><Card title="Doctor Workload"><HorizontalBarChart data={(data.doctors||[]).slice(0,12).map(r=>({label:`${r.name} · ${r.branch_name}`,value:num(r.completed)}))}/></Card><Card title="Top Billed Services"><HorizontalBarChart data={(data.services||[]).slice(0,12).map(r=>({label:r.name,value:num(r.gross_billed)}))} valueFormatter={money}/></Card></div>
  <Card title="Doctors" description="Up to 50 doctors; each row represents activity at one branch"><DataTable columns={[
   {label:'Doctor',key:'name'},{label:'Branch',key:'branch_name'},
   {label:'Bookings',right:true,render:r=>whole(r.appointments)},
   {label:'Patients',right:true,render:r=>whole(r.patients)},
   {label:'Completed',right:true,render:r=>whole(r.completed)},
   {label:'No-show',right:true,render:r=>whole(r.no_show)},
  ]} rows={data.doctors}/></Card>
  <Card title="Services" description="Top 50 billed services before discounts; medicine and supplies are excluded"><DataTable columns={[
   {label:'Service',key:'name'},{label:'Branch',key:'branch_name'},
   {label:'Bills',right:true,render:r=>whole(r.bills)},
   {label:'Quantity',right:true,render:r=>whole(r.quantity)},
   {label:'Billed Value',right:true,render:r=>money(r.gross_billed)},
  ]} rows={data.services}/></Card>
  <Card title="Promotion Performance" description="Promotional bills recorded in the selected period"><DataTable columns={[
   {label:'Offer',render:r=>r.name||'Untitled offer'},{label:'Branch',key:'branch_name'},
   {label:'Bills',right:true,render:r=>whole(r.bills)},
   {label:'Total Savings',right:true,render:r=>money(r.discounts)},
  ]} rows={data.promotions}/></Card>
  <Note>{data.note}</Note>
 </div>
}
function InventoryReport({data}) {
 const s=data.summary||{}
 return <div className="space-y-5">
  <Cards cards={[
   valueBox('Products',whole(s.products),'Current snapshot',MdInventory2),
   valueBox('Out of Stock',whole(s.out_of_stock),null,MdInventory2),
   valueBox('Low Stock',whole(s.low_stock),null,MdInventory2),
   valueBox('Expired Batches',whole(s.expired),null,MdInventory2),
   valueBox('Expiring Batches (30 Days)',whole(s.expiring_soon),null,MdCalendarMonth),
   valueBox('Selling-value Estimate',money(s.estimated_selling_value),'Not purchase cost or profit',MdPayments),
  ]}/>
  <div className="grid gap-5 lg:grid-cols-2"><Card title="Inventory by Category"><DataTable columns={[
   {label:'Category',key:'name'},{label:'Products',right:true,render:r=>whole(r.products)},
   {label:'Selling-value Estimate',right:true,render:r=>money(r.estimated_selling_value)},
  ]} rows={data.categories}/></Card>
  <Card title="Stock Movements" description="Activity within the selected period"><DataTable columns={[
   {label:'Type',render:r=>label(r.name)},
   {label:'Actions',right:true,render:r=>whole(r.actions)},
   {label:'Quantity',right:true,render:r=>whole(r.quantity)},
  ]} rows={data.movements}/></Card></div>
  <Card title="Stockroom & Treatment Room" description="Current quantities at each location"><DataTable columns={[
   {label:'Branch',key:'branch_name'},{label:'Room',key:'name'},
   {label:'Type',render:r=>label(r.location_type)},
   {label:'Products',right:true,render:r=>whole(r.products)},
   {label:'Quantity',right:true,render:r=>Number(r.quantity||0).toLocaleString('en-PH',{maximumFractionDigits:2})},
  ]} rows={data.stockrooms}/></Card>
  <Card title="Most Used Medicines & Supplies"><DataTable columns={[
   {label:'Item',key:'name'},{label:'Unit',key:'unit'},
   {label:'Branch',render:r=>r.branch_name||r.branch_id},
   {label:'Net Used',right:true,render:r=>Number(r.quantity||0).toLocaleString('en-PH',{maximumFractionDigits:2})},
  ]} rows={data.most_used}/></Card>
  <Note>As of {data.as_of}. {data.note}</Note>
 </div>
}
const RENDERS={overview:OverviewReport,appointments:AppointmentReport,financial:FinancialReport,services:ServicesReport,inventory:InventoryReport}
export default function ReportsPage(){
 const [period,setPeriod]=useState('30'),[from,setFrom]=useState(beforeISO(30)),[to,setTo]=useState(todayISO())
 const [branch,setBranch]=useState('all'),[section,setSection]=useState('overview')
 const [refreshCount,setRefreshCount]=useState(0),[details,setDetails]=useState(null),[detailsError,setDetailsError]=useState(''),[detailsLoading,setDetailsLoading]=useState(true)
 const [exportBusy,setExportBusy]=useState(false),[exportError,setExportError]=useState(''),[exportNotice,setExportNotice]=useState('')
 const requestRef=useRef(0)
 const valid=isValidReportPeriod(from,to)&&((Date.parse(to)-Date.parse(from))/86400000<=366)
 const {rows,trends,errors,loading,loadedAt,reload}=useOverviewData({from,to,branch})
 const branches=useMemo(()=>branch==='all'?(rows||[]):(rows||[]).filter(r=>String(r.id)===branch),[rows,branch])
 const branchName=branch==='all'?'All Branches':(rows||[]).find(r=>String(r.id)===branch)?.name||'Selected Branch'
 const urlFor=useCallback(key=>`/analytics/report-details?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&section=${encodeURIComponent(key)}${branch==='all'?'':`&branch_id=${encodeURIComponent(branch)}`}`,[from,to,branch])
 useEffect(()=>{
  const id=++requestRef.current
  if(!valid){setDetails(null);setDetailsError('Select a valid date range of no more than 366 days.');setDetailsLoading(false);return}
  const controller=new AbortController();setDetails(null);setDetailsError('');setDetailsLoading(true)
  fetchJson(urlFor(section),{signal:controller.signal}).then(result=>{
   if(id===requestRef.current&&!controller.signal.aborted) setDetails(result?.data||null)
  }).catch(error=>{if(id===requestRef.current&&!controller.signal.aborted)setDetailsError(error.message||'Unable to load this report.')}).finally(()=>{if(id===requestRef.current&&!controller.signal.aborted)setDetailsLoading(false)})
  return()=>controller.abort()
 },[section,refreshCount,valid,urlFor])
 const changePeriod=next=>{
  setPeriod(next)
  if(next==='custom')return
  setFrom(beforeISO(Number(next)));setTo(todayISO())
 }
 const refresh=()=>{reload();setRefreshCount(x=>x+1);setExportError('');setExportNotice('')}
 const exportPdf=async()=>{
  if(!valid||exportBusy||detailsLoading||!details||rows===null)return
  setExportError('');setExportNotice('');setExportBusy(true)
  try{
   const results=await Promise.all(REPORT_SECTIONS.map(async item=>{
    if(item.value===section&&details)return [item.value,details]
    const payload=await fetchJson(urlFor(item.value))
    if(!payload?.data)throw new Error(`${item.label} returned no data.`)
    return [item.value,payload.data]
   }))
   const html=buildSuperAdminReportHtml(Object.fromEntries(results),{branchName,from,to,branches})
   await printSuperAdminReport(html)
   setExportNotice('Print dialog opened. Choose “Save as PDF” to save all report sections for the selected branch and dates.')
  }catch(error){setExportError(error.message||'Unable to prepare the PDF report. Try again.')}
  finally{setExportBusy(false)}
 }
 const Report=RENDERS[section]
 return <div id="super-admin-report" className="space-y-6">
  <PageHead title="Reports & Analytics" description="View clinic operations, collections, consultations and inventory across all branches or one clinic." action={<div className="flex flex-wrap items-center gap-2" data-report-actions>
   <></>
   <SecondaryButton onClick={exportPdf} disabled={!valid||exportBusy||loading||detailsLoading||!details||rows===null}><MdPictureAsPdf/> {exportBusy?'Preparing PDF…':'Print / Save PDF'}</SecondaryButton>
  </div>}/>
  <Card className="print:shadow-none" ><div data-report-controls className="flex flex-wrap items-end gap-4">
   <label className="min-w-0 w-full flex-1 text-xs font-bold text-slate-600 sm:min-w-[190px]">Clinic Branch<select aria-label="Clinic Branch" className="form-control mt-1 w-full" value={branch} onChange={event=>setBranch(event.target.value)}><option value="all">All Branches</option>{(rows||[]).map(r=><option key={r.id} value={r.id}>{r.name}{!Number(r.is_active)?' (Inactive)':''}</option>)}</select></label>
   <label className="min-w-[160px] text-xs font-bold text-slate-600">Reporting Period<select aria-label="Reporting Period" className="form-control mt-1 w-full" value={period} onChange={event=>changePeriod(event.target.value)}><option value="1">Today</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="custom">Custom Dates</option></select></label>
   {period==='custom'&&<><label className="text-xs font-bold text-slate-600">From<input type="date" aria-label="From" className="form-control mt-1" value={from} onChange={event=>setFrom(event.target.value)}/></label><label className="text-xs font-bold text-slate-600">To<input type="date" aria-label="To" className="form-control mt-1" value={to} onChange={event=>setTo(event.target.value)}/></label></>}
  </div><p className="mt-3 text-xs text-slate-500">{branchName} · {from} to {to}{loadedAt?` · Updated ${loadedAt.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}`:''}</p></Card>
  <nav data-report-controls aria-label="Report Sections" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{REPORT_SECTIONS.map(tab=><button key={tab.value} type="button" onClick={()=>setSection(tab.value)} aria-current={section===tab.value?'page':undefined} className={`min-h-10 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${section===tab.value?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100'}`}>{tab.label}</button>)}</nav>
  {section==='financial'&&valid&&<FinancialAllocationReport global branchId={branch} from={from} to={to}/>}
  {exportError&&<Banner onDismiss={()=>setExportError('')}>{exportError}</Banner>}
  {exportNotice&&<Banner type="info" title="Save your PDF" onDismiss={()=>setExportNotice('')}>{exportNotice}</Banner>}
  {errors.period&&<Banner>{errors.period}</Banner>}
  {detailsError&&<Banner onRetry={refresh}>{detailsError}</Banner>}
  {detailsLoading?<Loading cards={6}/>:details?<Report data={details} branches={branches} trends={trends} error={errors.trends} refresh={refresh}/>:!detailsError?<Banner>Report data is unavailable. Try refreshing.</Banner>:null}
  <p className="text-xs text-slate-500">Reports show aggregate clinic information only. Selected filters apply to summaries, charts, tables and downloads. Current balance and stock snapshots are identified separately from date-scoped activity.</p>
 </div>
}
