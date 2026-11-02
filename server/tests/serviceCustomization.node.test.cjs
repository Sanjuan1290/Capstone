const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const path=require('node:path')
const originalLoad=Module._load
Module._load=function(id,parent,...args){
  if(parent?.filename?.includes('/server/utils/chargeAdjustments.js') && id==='./audit')return {writeAuditLog:async()=>{}}
  if(id==='../db/connect' && parent?.filename?.includes('/server/utils/'))return {query:async()=>[[]]}
  return originalLoad.apply(this,[id,parent,...args])
}
const billing=require('../utils/billing')
const finance=require('../utils/chargeAdjustments')
Module._load=originalLoad

const materials=[{id:1,billing_service_id:77,inventory_id:7,material_name:'Gloves',quantity:1,unit_label:'unit',unit_cost_override:null,sort_order:0},{id:2,billing_service_id:77,inventory_id:8,material_name:'Saline',quantity:1,unit_label:'unit',unit_cost_override:null,sort_order:1}]
const stock=[{id:7,name:'Gloves',category:'medical',unit:'unit',base_unit:'unit',uom:'unit',unit_size:1,selling_price:40},{id:8,name:'Saline',category:'medical',unit:'unit',base_unit:'unit',uom:'unit',unit_size:1,selling_price:65},{id:9,name:'Alternate Saline',category:'medical',unit:'unit',base_unit:'unit',uom:'unit',unit_size:1,selling_price:80}]
const executor={query:async(sql,params)=>{
  if(sql.includes('FROM billing_service_catalog bsc'))return [[{id:77,branch_id:1,service_name:'Wound Dressing',category:'General Medicine',default_price:455,consultation_fee:350,is_active:1}]]
  if(sql.includes('FROM billing_service_materials m'))return [materials]
  if(sql.includes('FROM inventory')&&sql.includes('WHERE id IN'))return [stock.filter(item=>params.includes(item.id))]
  throw new Error('Unexpected SQL in billing test: '+sql.slice(0,120))
}}
test('unchanged service keeps catalog inclusive total (no double charge)',async()=>{
  const lines=await billing.normalizeBillingItems([{item_type:'service',catalog_service_id:77,quantity:1,materials:[{inventory_id:7,material_name:'Gloves',quantity:1},{inventory_id:8,material_name:'Saline',quantity:1}]}],executor,1)
  assert.equal(lines[0].unit_price,455)
  assert.equal(lines[0].line_total,455)
  const details=JSON.parse(lines[0].details_json)
  assert.equal(details.pricing.consultation_fee,350)
  assert.deepEqual(details.materials.map(i=>i.charge_total),[40,65])
})
test('substitute Saline with alternative prices patient-specific ₱470, deducts only actual products',async()=>{
  const lines=await billing.normalizeBillingItems([{item_type:'service',catalog_service_id:77,quantity:1,usage_overridden:true,usage_change_reason:'Physician selected available saline.',materials:[{inventory_id:7,material_name:'Gloves',quantity:1},{inventory_id:9,material_name:'Alternate Saline',quantity:1}]}],executor,1)
  assert.equal(lines[0].unit_price,470)
  assert.deepEqual(billing.collectInventoryUsageFromBillingItems(lines).map(x=>x.inventory_id),[7,9])
  const details=JSON.parse(lines[0].details_json)
  assert.equal(details.pricing.original_price,455)
  assert.equal(details.usage_change_reason,'Physician selected available saline.')
})

test('new extra consumable is charged separately but counted only once for inventory',async()=>{
 const raw=[{item_type:'service',catalog_service_id:77,quantity:1,materials:[{inventory_id:7,material_name:'Gloves',quantity:1},{inventory_id:8,material_name:'Saline',quantity:1},{inventory_id:8,material_name:'Saline',quantity:1,consultation_extra:true}],usage_change_reason:'Additional saline was used during treatment.'}]
 const lines=await billing.normalizeBillingItems(billing.buildConsultationBillingItems(raw,55),executor,1)
 assert.equal(lines.reduce((n,i)=>n+i.line_total,0),520)
 const usage=billing.collectInventoryUsageFromBillingItems(lines)
 assert.equal(usage.find(x=>x.inventory_id===8).quantity,2)
})
function setup(){
 const stored={bill:{id:6,branch_id:1,status:'draft',version:1,subtotal:455,discount_amount:0,total_amount:455,consultation_id:11},requests:[],clinical:{status:'finalized'},logs:[]}
 const serviceItem={id:90,billing_id:6,item_type:'service',source_type:'consultation',catalog_service_id:77,service_name:'Wound Dressing',quantity:1,line_total:455,details_json:JSON.stringify({pricing:{consultation_fee:350},materials:[{inventory_id:7,material_name:'Gloves',quantity:1,charge_total:40},{inventory_id:8,material_name:'Saline',quantity:1,charge_total:65}]})}
 const conn={query:async(sql,args=[])=>{
  stored.logs.push(sql)
  if(sql.includes('FROM consultations WHERE'))return [[stored.clinical]]
  if(sql.includes('FROM billing_items bi JOIN'))return [[serviceItem]]
  if(sql.includes('FROM billing_records WHERE')||sql.includes('FROM billing_records WHERE'))return [[stored.bill]]
  if(sql.startsWith('SELECT id,version,subtotal,status,consultation_id'))return [[stored.bill]]
  if(sql.includes('COALESCE(SUM(requested_amount),0)'))return [[{amount:stored.requests.filter(x=>sql.includes("status IN")?['approved','pending'].includes(x.status):x.status==='approved').reduce((sum,x)=>sum+x.requested_amount,0)}]]
  if(sql.startsWith('SELECT requested_amount,status FROM billing_charge_adjustments'))return [stored.requests.filter(x=>['approved','pending'].includes(x.status))]
  if(sql.startsWith('SELECT * FROM billing_charge_adjustments WHERE id='))return [[stored.requests.find(x=>x.id===args[0])]]
  if(sql.startsWith('SELECT * FROM billing_charge_adjustments WHERE branch_id='))return [stored.requests]
  if(sql.startsWith('INSERT INTO billing_charge_adjustments')){
    stored.requests.push({id:5,branch_id:1,billing_id:6,bill_version:stored.bill.version,target_type:args[3],catalog_service_id:args[4],inventory_id:args[5],requested_amount:args[6],original_charge_snapshot:args[7],reason:args[8],status:'pending'})
    return [{insertId:5}]
  }
  if(sql.startsWith('UPDATE billing_records SET discount_amount=')){
    stored.bill.discount_amount=args[0];stored.bill.total_amount=args[1];stored.bill.version++
    return [{affectedRows:1}]
  }
  if(sql.startsWith('UPDATE billing_adjustment_requests SET status='))return [{affectedRows:0}]
  if(sql.startsWith('UPDATE billing_charge_adjustments SET status=')){
    if(sql.includes('id<>?'))stored.requests.filter(x=>x.id!==args[1]&&x.status==='pending').forEach(x=>x.status='expired')
    else stored.requests.find(x=>x.id===args[3]).status=args[0]
    return [{affectedRows:1}]
  }
  throw new Error('Unexpected SQL '+sql)
 }}
 return {conn,stored}
}
test('billing request cannot exceed supply charge',async()=>{
 const {conn}=setup()
 await assert.rejects(()=>finance.request({billingId:6,branchId:1,actorRole:'doctor',actorId:3,targetType:'consumable',serviceId:77,inventoryId:7,amount:41,reason:'Courtesy discount'},conn),{code:'DISCOUNT_EXCEEDS_CHARGE'})
})
test('requires a completed consultation before requesting a charge reduction',async()=>{
 const {conn,stored}=setup();stored.clinical.status='draft'
 await assert.rejects(()=>finance.request({billingId:6,branchId:1,actorRole:'doctor',actorId:3,targetType:'service_fee',serviceId:77,amount:200,reason:'Courtesy discount'},conn),{code:'CONSULTATION_NOT_COMPLETED'})
})
test('approval reduces bill payable but never writes to inventory',async()=>{
 const {conn,stored}=setup()
 const id=await finance.request({billingId:6,branchId:1,actorRole:'doctor',actorId:3,targetType:'service_fee',serviceId:77,amount:200,reason:'Courtesy discount'},conn)
 assert.equal(id,5)
 const approved=await finance.resolve({billingId:6,branchId:1,requestId:id,adminId:8,status:'approved'},conn)
 assert.equal(approved.status,'approved')
 assert.equal(stored.bill.discount_amount,200)
 assert.equal(stored.bill.total_amount,255)
 assert.equal(stored.bill.version,2)
 assert.equal(await finance.approvedTotal(conn,6),200)
 assert.equal(stored.logs.some(sql=>/UPDATE inventory|INSERT INTO inventory_logs|DELETE FROM inventory/.test(sql)),false)
 await assert.rejects(()=>finance.resolve({billingId:6,branchId:1,requestId:id,adminId:8,status:'approved'},conn),{code:'ADJUSTMENT_RESOLVED'})
})
test('version mismatch prevents stale adjustment approval',async()=>{
 const {conn,stored}=setup()
 const id=await finance.request({billingId:6,branchId:1,actorRole:'staff',actorId:4,targetType:'consumable',serviceId:77,inventoryId:8,amount:50,reason:'Doctor approved a free supply'},conn)
 stored.bill.version=2
 await assert.rejects(()=>finance.resolve({billingId:6,branchId:1,requestId:id,adminId:8,status:'approved'},conn),{code:'ADJUSTMENT_STALE'})
})

test('courtesy and preset discount amounts are separated before checkout saves',()=>{
 assert.equal(finance.requestedPresetDiscount({discount_amount:200},200),0)
 assert.equal(finance.requestedPresetDiscount({discount_amount:255,preset_discount_amount:55},200),55)
 assert.equal(finance.requestedPresetDiscount({discount_amount:55},0),55)
 assert.equal(finance.money(finance.requestedPresetDiscount({discount_amount:255,preset_discount_amount:55},200)+200),255)
})
