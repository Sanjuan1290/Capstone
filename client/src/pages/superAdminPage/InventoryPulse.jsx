import {useEffect,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {Card,StatCard,fetchJson,pesos} from './redesign/shared'
export default function InventoryPulse(){
 const [data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let on=true;fetchJson('/inventory/all?view=combined&limit=1').then(d=>{if(on)setData(d.summary)}).catch(e=>{if(on)setError(e.message)});return()=>{on=false}},[])
 return <Card title="All Inventory Snapshot" description="Stock status across active clinic branches" action={<NavLink className="text-sm font-semibold text-amber-700 underline" to="/superadmin/inventory">Explore All Inventory</NavLink>}>
  {error?<p className="text-sm text-rose-700">{error}</p>:!data?<p className="text-sm text-slate-500">Loading inventory totals…</p>:<div className="grid gap-3 sm:grid-cols-3"><StatCard label="Out of stock" value={data.out_of_stock}/><StatCard label="Low stock" value={data.low_stock}/><StatCard label="Stock value at cost" value={pesos(data.total_stock_value)}/></div>}
 </Card>
}


