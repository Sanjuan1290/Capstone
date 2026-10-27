import {useEffect,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {MdInventory2,MdRefresh} from 'react-icons/md'
import {PageHead,Card,Banner,Loading,Empty,StatCard,pesos,whole,fetchJson} from './redesign/shared'

const field='form-control w-full'
export default function SuperAdminAllInventory(){
 const [filters,setFilters]=useState({view:'combined',search:'',category:'',item_type:'',status:'',sort:'name',branch_ids:'',include_archived:false,page:1,limit:25})
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[nonce,setNonce]=useState(0)
 const [branchDirectory,setBranchDirectory]=useState([])
 const [selected,setSelected]=useState(null),[batches,setBatches]=useState([]),[batchesError,setBatchesError]=useState('')
 useEffect(()=>{
  let active=true;setLoading(true);setError('')
  const params=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==''&&v!==false).map(([k,v])=>[k,String(v)]))
  fetchJson(`/inventory/all?${params}`).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[filters,nonce])
 useEffect(()=>{
  let active=true
  fetchJson('/').then(rows=>{if(active)setBranchDirectory(Array.isArray(rows)?rows:[])}).catch(()=>{})
  return()=>{active=false}
 },[])
 const update=(key,value)=>setFilters(f=>({...f,[key]:value,page:1}))
 const openBatches=async row=>{
  setSelected(row);setBatches([]);setBatchesError('')
  const ids=row.inventory_ids||[row.id]
  try{setBatches(await fetchJson(`/inventory/all/batches?item_ids=${ids.join(',')}`))}
  catch(e){setBatchesError(e.message)}
 }
 const s=data?.summary||{}
 return <div className="space-y-6">
  <PageHead title="All Inventory" description="Read-only consolidated stock overview across clinic branches." action={<button className="button-secondary inline-flex items-center gap-2" onClick={()=>setNonce(n=>n+1)}><MdRefresh/> Refresh</button>}/>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
   <StatCard label="Branch items" value={whole(s.total_items)} icon={MdInventory2}/>
   <StatCard label="Out of stock" value={whole(s.out_of_stock)}/>
   <StatCard label="Low stock" value={whole(s.low_stock)}/>
   <StatCard label="Expiring (30 days)" value={whole(s.expiring_30_days)}/>
   <StatCard label="Expired" value={whole(s.expired)}/>
   <StatCard label="Stock at cost" value={pesos(s.total_stock_value)}/>
  </div>
  <Card title="Filter inventory"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
   <label className="text-xs font-semibold">Search<input className={field} value={filters.search} onChange={e=>update('search',e.target.value)} placeholder="Medicine, supply or barcode"/></label>
   <label className="text-xs font-semibold">View<select className={field} value={filters.view} onChange={e=>update('view',e.target.value)}><option value="combined">Combined items</option><option value="by_branch">By branch</option></select></label>
   <label className="text-xs font-semibold">Branch<select className={field} value={filters.branch_ids} onChange={e=>update('branch_ids',e.target.value)}><option value="">All active branches</option>{branchDirectory.filter(b=>Number(b.is_active)===1).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="text-xs font-semibold">Category<select className={field} value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">All</option><option value="medical">Medical</option><option value="derma">Dermatology</option></select></label>
   <label className="text-xs font-semibold">Type<select className={field} value={filters.item_type} onChange={e=>update('item_type',e.target.value)}><option value="">All</option><option value="medicine">Medicines</option><option value="supplies">Supplies</option></select></label>
   <label className="text-xs font-semibold">Stock status<select className={field} value={filters.status} onChange={e=>update('status',e.target.value)}>{[['','All statuses'],['in_stock','In stock'],['low','Low'],['out','Out'],['expiring','Expiring in 30 days'],['expired','Expired']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
   <label className="text-xs font-semibold">Sort<select className={field} value={filters.sort} onChange={e=>update('sort',e.target.value)}><option value="name">Item name</option><option value="quantity">Highest quantity</option><option value="cost">Highest stock value</option><option value="expiry">Nearest expiry</option></select></label>
   <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={filters.include_archived} onChange={e=>update('include_archived',e.target.checked)}/>Include archived</label>
  </div></Card>
  {error&&<Banner onRetry={()=>setNonce(n=>n+1)}>{error}</Banner>}
  {loading?<Loading/>:data&&<>
   <Card title={`${whole(data.total)} inventory rows`} description="Select a row to inspect its batches, locations and quantities.">
    {data.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Item</th>{filters.view==='by_branch'&&<th className="p-3">Branch</th>}<th className="p-3">Quantity (base units)</th><th className="p-3">Low branches</th><th className="p-3">Nearest expiry</th><th className="p-3">At cost</th><th className="p-3">At selling price</th><th className="p-3">Details</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={`${r.key||r.id}-${i}`} className="border-b"><td className="p-3 font-semibold">{r.name}<p className="text-xs font-normal text-slate-500">{[r.strength,r.dosage_form,r.category].filter(Boolean).join(' · ')}</p></td>{filters.view==='by_branch'&&<td className="p-3">{r.branch_name}</td>}<td className="p-3">{whole(r.quantity_base)}</td><td className="p-3">{r.branches_below_threshold?.join(', ')||((r.low||r.out)?r.branch_name:'—')}</td><td className="p-3">{r.nearest_expiry||'—'} {r.nearest_expiry_branch&&<span className="block text-xs text-slate-500">{r.nearest_expiry_branch}</span>}</td><td className="p-3">{pesos(r.cost_value)}</td><td className="p-3">{pesos(r.selling_value)}</td><td className="p-3"><button className="font-semibold text-amber-700 underline" onClick={()=>openBatches(r)}>View batches</button></td></tr>)}</tbody></table></div>:<Empty title="No matching inventory" description="Adjust the selected filters."/>}
    <div className="mt-4 flex items-center justify-between gap-2 text-sm"><span>Page {data.page} of {Math.max(1,Math.ceil(data.total/data.limit))}</span><div className="flex gap-2"><button className="button-secondary" disabled={filters.page<=1} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>Previous</button><button className="button-secondary" disabled={filters.page*filters.limit>=data.total} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>Next</button></div></div>
   </Card>
   <Card title="Branch comparison"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">Branch</th><th className="p-2">Items</th><th className="p-2">Low stock</th><th className="p-2">Stock at cost</th></tr></thead><tbody>{data.comparison.map(b=><tr className="border-b" key={b.branch_id}><td className="p-2">{b.branch_name}</td><td className="p-2">{b.item_count}</td><td className="p-2">{b.low_stock}</td><td className="p-2">{pesos(b.cost_value)}</td></tr>)}</tbody></table></div></Card>
  </>}
  {selected&&<div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside role="dialog" aria-modal="true" aria-label="Inventory batches" className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="mb-5 flex justify-between"><div><h2 className="text-xl font-black">{selected.name}</h2><p className="text-sm text-slate-500">Batch detail by physical branch</p></div><button className="button-secondary" onClick={()=>setSelected(null)}>Close</button></div>{batchesError&&<Banner>{batchesError}</Banner>}{selected.per_branch?.map(p=><div className="mb-3 text-sm" key={p.branch_id}><span className="font-semibold">{p.branch_name}: {whole(p.quantity_base)} base units</span> · <NavLink className="text-amber-700 underline" to={`/superadmin/branches/${p.branch_id}/inventory?search=${encodeURIComponent(selected.name)}`}>Open branch inventory</NavLink></div>)}<div className="space-y-2">{batches.map(b=><div key={`${b.id}-${b.location_name}`} className="rounded-xl border p-3 text-sm"><strong>{b.branch_name}</strong> · {b.batch_code||'Unnamed batch'}<p className="text-slate-500">Lot: {b.lot||'—'} · Expires: {b.expiration_date||'—'} · Location: {b.location_name||'Unallocated'}</p><p>Batch quantity {whole(b.quantity)} · Location quantity {whole(b.location_quantity??0)}</p></div>)}</div></aside></div>}
 </div>
}

