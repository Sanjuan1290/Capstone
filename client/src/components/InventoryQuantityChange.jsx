import { formatInventoryQuantity } from '../utils/inventoryQuantity.mjs'
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return {}}}
export default function InventoryQuantityChange({ row }) {
  if(row?.action!=='inventory.movement_recorded')return null
  const before=parse(row.old_values)?.quantity,after=parse(row.new_values)?.quantity
  return <p className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-slate-800">Item total: <strong>Before {formatInventoryQuantity(before)}</strong> → <strong>After {formatInventoryQuantity(after)}</strong></p>
}
