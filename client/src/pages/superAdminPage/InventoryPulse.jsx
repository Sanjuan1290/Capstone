import {useEffect,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {Card,StatCard,fetchJson,pesos} from './redesign/shared'
import StockAlertBanner from '../../components/StockAlertBanner'
export default function InventoryPulse(){
 const [data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let on=true;fetchJson('/inventory/all?view=by_branch&limit=1').then(d=>{if(on)setData(d.summary)}).catch(e=>{if(on)setError(e.message)});return()=>{on=false}},[])
 return <Card title="All Inventory Snapshot" description="Available stock across active branches; selling values use physical stock" action={<NavLink className="text-sm font-semibold text-amber-700 underline" to="/superadmin/inventory">Explore All Inventory</NavLink>}>
  {data && !error && <StockAlertBanner count={Number(data.low_stock||0)+Number(data.out_of_stock||0)} to="/superadmin/inventory?status=alerts" />}
  {error?<p className="text-sm text-rose-700">{error}</p>:!data?<p className="text-sm text-slate-500">Loading inventory totals…</p>:<div className="mt-3 grid gap-3 sm:grid-cols-3"><StatCard label="Out of stock" value={data.out_of_stock}/><StatCard label="Low stock" value={data.low_stock}/><StatCard label="Estimated selling value" value={pesos(data.total_selling_value)}/></div>}
 </Card>
}
