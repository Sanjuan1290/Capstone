const test=require('node:test'),assert=require('node:assert/strict')
const {validateSupplyQuantity}=require('../../utils/supplyQuantity')
const {normalizeBillingItems,buildConsultationBillingItems,collectInventoryUsageFromBillingItems,getBillingRecordWithItems}=require('../../utils/billing')
const {paymentViewPredicate}=require('../../utils/billingViews')
const {activityTimeline}=require('../../utils/billHistory')
const stock=[{id:7,name:'Gauze',unit:'unit',uom:'unit',selling_price:5,uom_allow_decimal:0},{id:8,name:'Liquid',unit:'ml',uom:'ml',selling_price:10,uom_allow_decimal:1,uom_decimal_precision:2}]
const catalog={id:77,service_name:'Wound Dressing',consultation_fee:525,default_price:540,category:'medical'}
const executor={query:async(sql,args)=>{
 if(sql.includes('FROM billing_service_catalog bsc'))return [[catalog]]
 if(sql.includes('FROM billing_service_materials m'))return [[{catalog_service_id:77,inventory_id:7,material_name:'Gauze',quantity:1,unit_label:'unit'},{catalog_service_id:77,inventory_id:8,material_name:'Liquid',quantity:1,unit_label:'ml'}]]
 if(sql.includes('FROM inventory')&&sql.includes('WHERE id IN'))return [stock.filter(i=>args.includes(i.id))]
 throw new Error('Unexpected SQL '+sql)
}}
test('quantity-only changes alter inventory consumption without changing service price or fee',async()=>{
 for(const qty of [1,2]){
 const items=await normalizeBillingItems([{item_type:'service',catalog_service_id:77,quantity:1,usage_overridden:true,materials:[{inventory_id:7,quantity:qty,material_name:'Gauze'},{inventory_id:8,quantity:1.09,material_name:'Liquid'}]}],executor,1)
 assert.equal(items[0].line_total,540);assert.equal(JSON.parse(items[0].details_json).pricing.consultation_fee,525)
 const usage=collectInventoryUsageFromBillingItems(items);assert.equal(usage.find(i=>i.inventory_id===7).quantity,qty);assert.equal(usage.find(i=>i.inventory_id===8).quantity,1.09)
 }
})
test('fractional included or extra discrete items are rejected, measured extras bill once',async()=>{
 const service=materials=>[{catalog_service_id:77,item_type:'service',quantity:1,materials}]
 await assert.rejects(()=>normalizeBillingItems(service([{inventory_id:7,quantity:1.09,material_name:'Gauze'}]),executor,1),{code:'WHOLE_UNIT_QUANTITY_REQUIRED'})
 const raw=service([{inventory_id:7,quantity:1,material_name:'Gauze'},{inventory_id:8,quantity:1.09,material_name:'Liquid',consultation_extra:true}])
 const lines=await normalizeBillingItems(buildConsultationBillingItems(raw,11),executor,1)
 assert.equal(lines[0].line_total,540);assert.equal(lines[1].line_total,10.9)
 assert.equal(collectInventoryUsageFromBillingItems(lines).find(i=>i.inventory_id===8).quantity,1.09)
 for(const value of [0,-1,1.001,Infinity,[],{}])assert.throws(()=>validateSupplyQuantity(value,stock[1]),{statusCode:400})
})
async function ledger(payments){
 const query=async sql=>{
  if(sql.includes('FROM billing_records b'))return [[{id:6,total_amount:405,subtotal:540,discount_amount:135,status:'partially_paid'}]]
  if(sql.includes('FROM billing_items'))return [[]]
  if(sql.includes('FROM billing_payments bp'))return [payments]
  throw new Error('Unexpected SQL '+sql)
 }
 return getBillingRecordWithItems(6,{query})
}
test('partial and multiple payments preserve exact unpaid balance',async()=>{
 const payments=[{id:1,amount:100,status:'completed',refund_amount:0,receipt_number:'OR-1'}]
 let bill=await ledger(payments);assert.equal(bill.paid_amount,100);assert.equal(bill.balance_amount,305)
 payments.push({id:2,amount:305,status:'completed',refund_amount:0,receipt_number:'OR-2'})
 bill=await ledger(payments);assert.equal(bill.paid_amount,405);assert.equal(bill.balance_amount,0);assert.deepEqual(bill.payments.map(p=>p.receipt_number),['OR-1','OR-2'])
})
test('voids and refunds reduce collections, failed attempts never enter paid total',async()=>{
 const bill=await ledger([{amount:405,status:'completed',refund_amount:50},{amount:405,status:'voided',refund_amount:0},{amount:405,status:'failed',refund_amount:0}])
 assert.equal(bill.paid_amount,355);assert.equal(bill.balance_amount,50)
 assert.match(paymentViewPredicate('failed'),/gateway.status='failed'/);assert.match(paymentViewPredicate('pending'),/completed.status='finalized'/)
 for(const invalid of ['cancelled','expired','__proto__','constructor','anything'])assert.equal(paymentViewPredicate(invalid),'')
})
test('history timeline retains failed, cancelled, expired, successful and refunded events chronologically',()=>{
 const bill={created_at:'2026-11-05 09:00:00',payments:[{id:3,paid_at:'2026-11-05 11:00:00',amount:405,payment_method:'cash',receipt_number:'OR-3'}]}
 const timeline=activityTimeline(bill,{attempts:[{id:1,created_at:'2026-11-05 10:00:00',updated_at:'2026-11-05 10:01:00',status:'failed',error_code:'DECLINED'},{id:2,created_at:'2026-11-05 10:02:00',updated_at:'2026-11-05 10:03:00',status:'cancelled'},{id:3,created_at:'2026-11-05 10:04:00',updated_at:'2026-11-05 10:05:00',status:'expired'}],refunds:[{id:4,refunded_at:'2026-11-05 12:00:00',amount:50,reason:'Patient refund'}]})
 assert.equal(timeline[0].label,'Bill created');assert.equal(timeline.at(-1).label,'Refund recorded')
 for(const label of ['QR Ph failed','QR Ph cancelled','QR Ph expired','Payment recorded'])assert.ok(timeline.some(e=>e.label===label))
})

test('fractional supply currency rounds half-cent products consistently with the client estimate',async()=>{
 const roundedExecutor={query:async(sql,args)=>{
  const result=await executor.query(sql,args)
  return sql.includes('FROM inventory')&&sql.includes('WHERE id IN')?[result[0].map(row=>({...row,selling_price:0.35}))]:result
 }}
 const lines=await normalizeBillingItems([{item_type:'supply',source_type:'consultation_extra',inventory_id:8,quantity:0.1}],roundedExecutor,1)
 assert.equal(lines[0].line_total,0.04)
})
