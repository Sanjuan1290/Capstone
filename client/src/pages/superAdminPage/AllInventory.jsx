import {useEffect,useRef,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {MdInventory2,MdRefresh,MdFileDownload,MdFilterList,MdSearch,MdClose,MdChevronLeft,MdChevronRight,MdFirstPage,MdLastPage,MdWarningAmber,MdCalendarMonth,MdStorefront,MdOutlineInventory,MdInfoOutline,MdVisibility,MdLockOutline,MdExpandMore,MdExpandLess,MdAccountTree} from 'react-icons/md'
import {PageHead,Card,Banner,Loading,Empty,StatCard,whole,fetchJson} from './redesign/shared'
import {buildFilters,createInventoryCsv,dateOnly,money,number,statusLabels} from './inventoryView.mjs'

const field='form-control mt-1.5 w-full text-sm'
const initialFilters={view:'combined',search:'',category:'',item_type:'',status:'',sort:'name',branch_ids:'',include_archived:false,page:1,limit:10}
const statuses=[['','All stock states'],['alerts','Needs attention'],['low','Low stock'],['out','Out of stock'],['expiring','Expiring within 30 days'],['expired','Expired'],['in_stock','No current alert']]
const toneClass={danger:'bg-rose-50 text-rose-700 ring-rose-200',warning:'bg-amber-50 text-amber-800 ring-amber-200',success:'bg-emerald-50 text-emerald-700 ring-emerald-200'}
const StatusBadges=({item})=><div className="flex flex-wrap gap-1.5">{statusLabels(item).map((status,i)=><span key={`${status.label}-${i}`} className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${toneClass[status.tone]||toneClass.success}`}>{status.label}</span>)}</div>
const Field=({label,children})=><label className="block text-xs font-semibold text-slate-600">{label}{children}</label>
const SummaryCard=({label,value,description,Icon,tone='neutral'})=><div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone==='warning'?'bg-amber-50 text-amber-700':tone==='danger'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600'}`}><Icon size={18}/></span></div><p className="mt-2 break-words text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{description}</p></div>

export default function SuperAdminAllInventory(){
 const [filters,setFilters]=useState(initialFilters)
 const [searchInput,setSearchInput]=useState('')
 const [showAdvanced,setShowAdvanced]=useState(false)
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[nonce,setNonce]=useState(0)
 const [branchDirectory,setBranchDirectory]=useState([])
 const [selected,setSelected]=useState(null),[batches,setBatches]=useState([]),[batchesError,setBatchesError]=useState(''),[batchesLoading,setBatchesLoading]=useState(false)
 const detailRequest=useRef(0),resultsRef=useRef(null)
 useEffect(()=>{const timer=window.setTimeout(()=>setFilters(f=>f.search===searchInput?f:{...f,search:searchInput,page:1}),300);return()=>window.clearTimeout(timer)},[searchInput])
 useEffect(()=>{
  let active=true;setLoading(true);setError('')
  fetchJson(`/inventory/all?${buildFilters(filters)}`).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[filters,nonce])
 useEffect(()=>{
  let active=true;fetchJson('/').then(rows=>{if(active)setBranchDirectory(Array.isArray(rows)?rows:[])}).catch(()=>{})
  return()=>{active=false}
 },[])
 useEffect(()=>{
  if(!selected)return undefined
  const previousOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  const close=e=>{if(e.key==='Escape')setSelected(null)}
  document.addEventListener('keydown',close)
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',close)}
 },[selected])
 const update=(key,value)=>setFilters(f=>({...f,[key]:value,page:1}))
 const clearAll=()=>{setSearchInput('');setFilters(initialFilters)}
 const openDetails=async row=>{
  const request=++detailRequest.current
  setSelected(row);setBatches([]);setBatchesError('');setBatchesLoading(true)
  const ids=(row.inventory_ids||[row.id]).filter(id=>Number.isSafeInteger(Number(id))&&Number(id)>0)
  try{const rows=await fetchJson(`/inventory/all/batches?item_ids=${ids.join(',')}`);if(request===detailRequest.current)setBatches(Array.isArray(rows)?rows:[])}
  catch(e){if(request===detailRequest.current)setBatchesError(e.message)}
  finally{if(request===detailRequest.current)setBatchesLoading(false)}
 }
 const closeDetails=()=>{detailRequest.current++;setSelected(null)}
 const pageTo=page=>{setFilters(f=>({...f,page}));resultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}
 const exportPage=()=>{
  if(!data?.rows?.length)return
  const csv=createInventoryCsv(data.rows,filters.view)
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
  const link=document.createElement('a');link.href=url;link.download=`CARAIT_Inventory_${filters.view}_Page_${filters.page}.csv`
  document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),15000)
 }
 const summary=data?.summary||{}
 const totalPages=Math.max(1,Math.ceil(Number(data?.total||0)/Number(data?.limit||filters.limit)))
 const applied=[
  ...(filters.search?[{key:'search',label:`Search: ${filters.search}`}]:[]),
  ...(filters.branch_ids?[{key:'branch_ids',label:`Branch: ${branchDirectory.find(b=>String(b.id)===String(filters.branch_ids))?.name||filters.branch_ids}`}]:[]),
  ...(filters.category?[{key:'category',label:`Category: ${filters.category==='derma'?'Dermatology':'Medical'}`}]:[]),
  ...(filters.item_type?[{key:'item_type',label:`Type: ${filters.item_type}`}]:[]),
  ...(filters.status?[{key:'status',label:statuses.find(s=>s[0]===filters.status)?.[1]||filters.status}]:[]),
  ...(filters.include_archived?[{key:'include_archived',label:'Including archived'}]:[]),
 ]
 return <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-8">
  <PageHead title="All Inventory" description="Monitor stock levels, expiry risks, potential selling value and branch distribution across the clinic. Read-only overview." action={<><span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><MdLockOutline/> Read-only</span><button type="button" className="button-secondary inline-flex items-center gap-2" disabled={!data?.rows?.length} onClick={exportPage}><MdFileDownload/> Export Current Page</button><button type="button" className="button-secondary inline-flex items-center gap-2" onClick={()=>setNonce(n=>n+1)}><MdRefresh/> Refresh</button></>}/>
  {!data && loading ? <Loading cards={4}/> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <SummaryCard label="Distinct Products" value={loading&&!data?'—':whole(summary.total_products??0)} description={`${whole(summary.total_items??0)} branch inventory records in the selected scope`} Icon={MdInventory2}/>
   <SummaryCard label="Recorded Base Units" value={loading&&!data?'—':number(summary.total_units)} description="Sum across different products; units may not be directly comparable" Icon={MdOutlineInventory}/>
   <SummaryCard label="Low Stock Records" value={whole(summary.low_stock)} description="Branch-item records below their alert threshold" Icon={MdWarningAmber} tone="warning"/>
   <SummaryCard label="Out-of-Stock Records" value={whole(summary.out_of_stock)} description="Tracked branch-item records with zero quantity" Icon={MdOutlineInventory} tone="danger"/>
   <SummaryCard label="Expiring in 30 Days" value={whole(summary.expiring_30_days)} description="Branch-item records with upcoming expiry dates" Icon={MdCalendarMonth} tone="warning"/>
   <SummaryCard label="Expired Stock Records" value={whole(summary.expired)} description="Records with a positive-stock batch past its expiry" Icon={MdCalendarMonth} tone="danger"/>
   <SummaryCard label="Branches Monitored" value={whole(summary.branch_count)} description="Clinic branches included in the selected inventory scope" Icon={MdAccountTree}/>
   <SummaryCard label="Potential Selling Value" value={money(summary.total_selling_value)} description="Estimate using current product selling prices; not collected revenue" Icon={MdStorefront}/>
  </div>}
  {data && <Card title="Quick insights" description="Highlights from the selected inventory scope, not just the visible table page.">
   <div className="grid gap-3 md:grid-cols-3">
    <div className="flex gap-3 rounded-xl bg-slate-50 p-3"><MdWarningAmber className="mt-1 shrink-0 text-amber-600" size={22}/><div><p className="text-xs text-slate-500">Branches with stock alerts</p><p className="text-lg font-black text-slate-800">{whole(summary.branches_with_alerts)} <span className="text-xs font-normal text-slate-500">of {whole(summary.branch_count)} selected</span></p></div></div>
    <div className="flex gap-3 rounded-xl bg-slate-50 p-3"><MdCalendarMonth className="mt-1 shrink-0 text-slate-500" size={22}/><div><p className="text-xs text-slate-500">Nearest upcoming expiry</p><p className="text-sm font-bold text-slate-800">{dateOnly(summary.nearest_upcoming_expiry)||'None recorded'}</p></div></div>
    <div className="flex gap-3 rounded-xl bg-slate-50 p-3"><MdStorefront className="mt-1 shrink-0 text-slate-500" size={22}/><div><p className="text-xs text-slate-500">Highest potential selling-value product</p><p className="text-sm font-bold text-slate-800">{summary.highest_selling_product||'None'}{summary.highest_selling_product&&<span className="block text-xs font-normal text-slate-500">{money(summary.highest_selling_value)}</span>}</p></div></div>
   </div>
  </Card>}
  <Card title="Find inventory" description="Filter by branch, product or stock condition. Counts and summaries follow the current selection.">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Search product or barcode"><div className="relative"><MdSearch className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400"/><input aria-label="Search inventory" className={`${field} pl-10`} value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Search product or barcode"/></div></Field>
    <Field label="Branch"><select className={field} value={filters.branch_ids} onChange={e=>update('branch_ids',e.target.value)}><option value="">All active branches</option>{branchDirectory.filter(b=>Number(b.is_active)===1).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <Field label="View"><select className={field} value={filters.view} onChange={e=>update('view',e.target.value)}><option value="combined">Combined products</option><option value="by_branch">Items by branch</option></select></Field>
    <Field label="Stock condition"><select className={field} value={filters.status} onChange={e=>update('status',e.target.value)}>{statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(s=>!s)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MdFilterList/> {showAdvanced?'Hide':'More'} filters {showAdvanced?<MdExpandLess/>:<MdExpandMore/>}</button>{['alerts','low','out','expiring'].map(s=><button type="button" key={s} onClick={()=>update('status',filters.status===s?'':s)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filters.status===s?'bg-slate-900 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{statuses.find(v=>v[0]===s)?.[1]}</button>)}</div>
   {showAdvanced&&<div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Category"><select className={field} value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">All categories</option><option value="medical">General Medicine</option><option value="derma">Dermatology</option></select></Field>
    <Field label="Product type"><select className={field} value={filters.item_type} onChange={e=>update('item_type',e.target.value)}><option value="">All types</option><option value="medicine">Medicines</option><option value="supplies">Supplies</option></select></Field>
    <Field label="Sort results"><select className={field} value={filters.sort} onChange={e=>update('sort',e.target.value)}><option value="name">Product name A–Z</option><option value="quantity">Most base units first</option><option value="selling_value">Highest selling value</option><option value="expiry">Nearest expiry first</option></select></Field>
    <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={filters.include_archived} onChange={e=>update('include_archived',e.target.checked)}/> Include archived products</label>
   </div>}
   {applied.length>0&&<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-500">Applied:</span>{applied.map(tag=><button type="button" key={tag.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200" onClick={()=>tag.key==='search'?(setSearchInput(''),update('search','')):update(tag.key,tag.key==='include_archived'?false:'')}>{tag.label}<MdClose/></button>)}<button type="button" onClick={clearAll} className="text-xs font-bold text-amber-700 underline">Clear all filters</button></div>}
  </Card>
  {error&&<Banner onRetry={()=>setNonce(n=>n+1)}>{error}</Banner>}
  <div ref={resultsRef} className="scroll-mt-6"/>
  {loading&&!data?<Loading/>:data&&<>
   <Card title="Inventory results" description={`${whole(data.total)} ${filters.view==='combined'?'product groups':'branch-item records'} match your filters. Open details for branch locations and batches.`} action={<div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Rows per page</span><select aria-label="Rows per page" className="form-control w-20" value={filters.limit} onChange={e=>update('limit',Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></div>}>
    {loading&&<div role="status" className="mb-3 text-xs text-slate-500">Updating inventory…</div>}
    {data.rows?.length?<div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[930px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3">Product</th>{filters.view==='by_branch'&&<th scope="col" className="px-4 py-3">Branch</th>}<th scope="col" className="px-4 py-3">Quantity</th><th scope="col" className="px-4 py-3">Branches with Stock</th><th scope="col" className="px-4 py-3">Alerts</th><th scope="col" className="px-4 py-3">Nearest Expiry</th><th scope="col" className="px-4 py-3">Selling Value</th><th scope="col" className="px-4 py-3 text-right">Details</th></tr></thead><tbody className="divide-y divide-slate-100">
     {data.rows.map((r,i)=><tr key={`${r.key||r.id}-${i}`} className="align-middle hover:bg-slate-50"><td className="max-w-[250px] px-4 py-3"><p className="font-bold leading-snug text-slate-900">{r.name}</p><p className="mt-1 text-xs text-slate-500">{[r.category==='derma'?'Dermatology':r.category==='medical'?'General Medicine':r.category,r.item_type,r.strength,r.dosage_form].filter(Boolean).join(' · ')}</p>{r.archived_at&&<span className="mt-1 inline-block text-xs text-amber-700">Archived</span>}</td>{filters.view==='by_branch'&&<td className="px-4 py-3 text-xs font-medium text-slate-700">{r.branch_name}</td>}<td className="px-4 py-3 font-bold tabular-nums text-slate-900">{number(r.quantity_base)}<span className="block text-[11px] font-normal text-slate-500">{r.base_unit||'base units'}</span></td><td className="px-4 py-3 text-xs"><span className="font-bold text-slate-800">{filters.view==='by_branch'?(Number(r.quantity_base)>0?1:0):whole(r.branch_coverage ?? (r.per_branch?.filter(p=>Number(p.quantity_base)>0).length || 0))}</span><span className="block text-slate-500">{filters.view==='by_branch'?'of this branch':`of ${whole(summary.branch_count)} selected`}</span></td><td className="px-4 py-3"><StatusBadges item={r}/>{Boolean(r.branches_below_threshold?.length)&&<p className="mt-1 text-[11px] text-slate-500">{r.branches_below_threshold.length} branch issue(s)</p>}</td><td className="px-4 py-3 text-xs"><span className="font-semibold text-slate-800">{dateOnly(r.nearest_expiry)||'—'}</span>{r.nearest_expiry_branch&&<span className="block text-[11px] text-slate-500">{r.nearest_expiry_branch}</span>}</td><td className="px-4 py-3 text-xs font-semibold text-slate-800">{money(r.selling_value)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={()=>openDetails(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 hover:border-amber-300 hover:bg-amber-50"><MdVisibility/> View Details</button></td></tr>)}
    </tbody></table></div>:<Empty title="No matching inventory" description="Change the stock condition or clear filters to see products." action={applied.length>0&&<button className="button-secondary" onClick={clearAll}>Clear filters</button>}/>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600"><span>Showing <strong>{data.total?((data.page-1)*data.limit+1):0}–{Math.min(data.page*data.limit,data.total)}</strong> of <strong>{whole(data.total)}</strong> records</span><div className="flex items-center gap-1"><button type="button" className="button-secondary px-2 py-2" aria-label="First page" disabled={filters.page<=1} onClick={()=>pageTo(1)}><MdFirstPage/></button><button type="button" className="button-secondary px-2 py-2" aria-label="Previous page" disabled={filters.page<=1} onClick={()=>pageTo(filters.page-1)}><MdChevronLeft/></button><span className="px-3 font-bold text-slate-800">Page {Math.min(filters.page,totalPages)} / {totalPages}</span><button type="button" className="button-secondary px-2 py-2" aria-label="Next page" disabled={filters.page>=totalPages} onClick={()=>pageTo(filters.page+1)}><MdChevronRight/></button><button type="button" className="button-secondary px-2 py-2" aria-label="Last page" disabled={filters.page>=totalPages} onClick={()=>pageTo(totalPages)}><MdLastPage/></button></div></div>
    <p className="mt-2 text-[11px] text-slate-500">Export Current Page downloads only these visible records, not all pages.</p>
   </Card>
   <Card title="Branch comparison" description="Compare tracked products and stock alerts in each selected branch.">
    {data.comparison?.length?<div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[690px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Branch','Tracked Products','Low Stock','Out of Stock','Expiring / Expired','Selling Value'].map(label=><th scope="col" key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.comparison.map(b=><tr key={b.branch_id} className="hover:bg-slate-50"><td className="px-3 py-3 font-semibold text-slate-800"><NavLink className="hover:text-amber-700 hover:underline" to={`/superadmin/branches/${b.branch_id}/inventory`}>{b.branch_name}</NavLink></td><td className="px-3 py-3">{whole(b.item_count)}</td><td className="px-3 py-3">{whole(b.low_stock)}</td><td className="px-3 py-3">{whole(b.out_of_stock)}</td><td className="px-3 py-3">{whole(b.expiring)} / {whole(b.expired)}</td><td className="px-3 py-3">{money(b.selling_value)}</td></tr>)}</tbody></table></div>:<Empty title="No branch data" description="There are no selected branches with inventory."/>}
   </Card>
  </>}
  {selected&&<div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50" onMouseDown={e=>{if(e.target===e.currentTarget)closeDetails()}}><aside role="dialog" aria-modal="true" aria-label="Product inventory details" className="h-full w-full max-w-[720px] overflow-y-auto bg-white shadow-2xl" tabIndex={-1}><div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5"><div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-700">Product details · Read-only</p><h2 className="break-words text-lg font-black text-slate-900">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.category} · {selected.item_type}</p></div><button type="button" aria-label="Close details" className="button-secondary" onClick={closeDetails}><MdClose/> Close</button></div><div className="space-y-5 p-5">
    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Quantity</p><p className="text-xl font-black">{number(selected.quantity_base)}</p><p className="text-[11px] text-slate-500">{selected.base_unit||'base units'}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Selling Value</p><p className="text-lg font-black">{money(selected.selling_value)}</p></div></div>
    <div><h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><MdAccountTree/> Branch distribution</h3>{selected.per_branch?.length?<div className="space-y-2">{selected.per_branch.map(b=><div key={b.inventory_id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-slate-800">{b.branch_name}</p><p className="text-sm font-bold text-slate-900">{number(b.quantity_base)} units</p></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><StatusBadges item={b}/><NavLink className="text-xs font-semibold text-amber-700 underline" to={`/superadmin/branches/${b.branch_id}/inventory?search=${encodeURIComponent(selected.name)}`}>Open branch inventory</NavLink></div></div>)}</div>:<div className="rounded-xl border p-3 text-xs text-slate-500">{selected.branch_name||'This product is not distributed across multiple tracked branch rows.'}</div>}</div>
    <div><h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><MdOutlineInventory/> Batches and stock-room locations</h3>{batchesError&&<Banner onRetry={()=>openDetails(selected)}>{batchesError}</Banner>}{batchesLoading?<p role="status" className="py-4 text-sm text-slate-500">Loading batch locations…</p>:!batches.length?<p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">No active batch details are recorded for this selection.</p>:<div className="space-y-2">{batches.map((b,i)=><div key={`${b.id}-${b.location_name||'none'}-${i}`} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="flex justify-between gap-2"><strong className="text-slate-800">{b.branch_name} · {b.batch_code||`Batch #${b.id}`}</strong><span className="font-semibold text-slate-700">{number(b.location_quantity??b.quantity)} in location</span></div><p className="mt-1 text-xs text-slate-500">Room: {b.location_name||'Unallocated'} · Expires: {dateOnly(b.expiration_date)||'Not recorded'}</p><p className="mt-1 text-xs text-slate-500">Lot: {b.lot||'Not recorded'} · Total batch quantity: {number(b.quantity)}</p></div>)}</div>}</div>
    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><MdInfoOutline className="mr-1 inline"/> This view does not edit, receive, move or deduct stock. Use the authorized branch inventory workflow for changes.</div>
   </div></aside></div>}
 </div>
}
