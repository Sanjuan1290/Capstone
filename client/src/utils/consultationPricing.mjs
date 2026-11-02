// Read-only estimate. The backend resolves the final price from branch-owned
// inventory and service records and applies approved discounts later in Billing.
export function estimateConsultationServicePrice(service, catalog, inventory = []) {
  if (!catalog) return null
  const materials = Array.isArray(service?.materials) ? service.materials : []
  const defaults = (catalog.materials || []).filter(m=>Number(m.inventory_id)>0&&Number(m.quantity)>0)
  const actual = materials.filter(m=>!(m.consultation_extra===true||Number(m.consultation_extra||0)===1))
  const extras = materials.filter(m=>m.consultation_extra===true||Number(m.consultation_extra||0)===1)
  const configured = new Map(defaults.map(m=>[Number(m.inventory_id),Number(m.quantity)]))
  const included = new Map(actual.map(m=>[Number(m.inventory_id),Number(m.quantity)]))
  const changed = configured.size!==included.size || [...configured].some(([id,qty])=>included.get(id)!==qty)
  const inv=new Map(inventory.map(m=>[Number(m.id),m]))
  const suppliesPrice = values=>values.reduce((sum,m)=>{
    const i=inv.get(Number(m.inventory_id))
    const price=Number(i?.selling_price??i?.price)
    return (!i||!Number.isFinite(price)||price<=0||!Number.isFinite(sum))?NaN:sum+Number(m.quantity||0)*price
  },0)
  const extraTotal=suppliesPrice(extras)
  const servicePrice=changed?Number(catalog.consultation_fee)+suppliesPrice(actual):Number(catalog.default_price)
  const amount=servicePrice+extraTotal
  return Number.isFinite(amount)&&amount>=0 ? Math.round(amount*100)/100 : null
}
