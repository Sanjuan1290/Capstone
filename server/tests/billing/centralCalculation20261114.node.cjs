const test=require('node:test'),assert=require('node:assert/strict')
const {calculateFinancialBill:calculate}=require('../../utils/billingCalculation')
const {disabledPolicy}=require('../../utils/billingTaxPolicy')
const service=(amount=112,id=1)=>({id,item_type:'service',catalog_service_id:id,service_name:`Service ${id}`,quantity:1,unit_price:amount,line_total:amount,details:{pricing:{original_price:amount,doctor_fee_percentage:20},materials:[]}})
const policy=(mode='inclusive')=>({...disabledPolicy(),enabled:true,tax_rate:12,tax_mode:mode,rules:[{kind:'service_fee',id:1,treatment:'taxable',statutory_eligible:true}]})
test('disabled tax and the included doctor fee do not increase the patient bill',()=>{
 const calc=calculate({items:[service(3099)]});assert.equal(calc.total_amount,3099);assert.equal(calc.tax.amount,0);assert.equal(calc.doctor_fees[0].doctor_fee_amount,619.8);assert.equal('clinic_base_share' in calc.doctor_fees[0],false)
})
test('included inventory is split from the service, never added a second time',()=>{
 const item=service(3099);item.details.materials=[{inventory_id:5,material_name:'Dose',quantity:1,charge_quantity:1,charge_unit_price:2099}]
 const calc=calculate({items:[item]});assert.equal(calc.total_amount,3099);assert.equal(calc.components.length,2);assert.equal(calc.components[1].amount,1000);assert.equal(calc.components[1].unit_price,1000)
})
test('multiple services, independent rates and additional items reconcile',()=>{
 const a=service(100),b=service(200,2);b.details.pricing.doctor_fee_percentage=10
 const calc=calculate({items:[a,b,{id:3,item_type:'supply',source_inventory_id:8,quantity:2,unit_price:50,line_total:100,service_name:'Extra'}]})
 assert.equal(calc.subtotal,400);assert.equal(calc.total_amount,400);assert.deepEqual(calc.doctor_fees.map(r=>r.doctor_fee_amount),[20,20])
})
test('inclusive VAT is extracted; exclusive VAT is added only to classified taxable charges',()=>{
 const inclusive=calculate({items:[service()],policy:policy()});assert.equal(inclusive.total_amount,112);assert.equal(inclusive.tax.taxable_amount,100);assert.equal(inclusive.tax.amount,12)
 const exclusive=calculate({items:[service(100)],policy:policy('exclusive')});assert.equal(exclusive.total_amount,112);assert.equal(exclusive.tax.amount,12)
})
test('explicit VAT-exempt charges retain their price and do not receive blanket tax',()=>{
 const p=policy();p.rules[0].treatment='vat_exempt';const calc=calculate({items:[service()],policy:p});assert.equal(calc.total_amount,112);assert.equal(calc.tax.amount,0);assert.equal(calc.tax.vat_exempt_amount,112)
})
for(const type of ['senior','pwd'])test(`${type} removes applicable VAT before its verified 20% discount`,()=>{
 const calc=calculate({items:[service()],policy:policy(),discounts:[{key:'stat',type,name:type,mode:'percentage',value:20,verified:true}]})
 assert.equal(calc.discount_amount,20);assert.equal(calc.tax.vat_relief,12);assert.equal(calc.tax.amount,0);assert.equal(calc.total_amount,80);assert.equal(calc.discounts[0].eligible_amount,100)
})
test('statutory discount applies only to eligible charges in a mixed bill',()=>{
 const p=policy();p.rules.push({kind:'service_fee',id:2,treatment:'taxable',statutory_eligible:false})
 const calc=calculate({items:[service(),service(112,2)],policy:p,discounts:[{key:'pwd',type:'pwd',mode:'percentage',value:20,verified:true}]})
 assert.equal(calc.total_amount,192);assert.equal(calc.tax.amount,12);assert.equal(calc.discount_amount,20)
})
test('statutory discount works without assuming VAT when branch tax is disabled',()=>{
 const p=policy();p.enabled=false
 const calc=calculate({items:[service(100)],policy:p,discounts:[{key:'pwd',type:'pwd',mode:'percentage',verified:true}]})
 assert.equal(calc.total_amount,80);assert.equal(calc.tax.vat_relief,0)
})
test('statutory and promotional stacking, duplicate deductions and missing verification are rejected',()=>{
 const promotion={key:'promo',type:'promotion',mode:'fixed',amount:10},stat={key:'pwd',type:'pwd',mode:'percentage',verified:true}
 for(const discounts of [[promotion,stat],[promotion,promotion],[{...stat,verified:false}],[stat,{...stat,key:'senior',type:'senior'}]])assert.throws(()=>calculate({items:[service()],policy:policy(),discounts}),{statusCode:409})
})
test('fixed discounts distribute exact cents and percentages round once across eligible charges',()=>{
 const items=[service(0.01),service(0.01,2),service(0.01,3)]
 const calc=calculate({items,discounts:[{key:'fixed',type:'other',mode:'fixed',amount:0.01}]})
 assert.equal(calc.discount_amount,0.01);assert.equal(calc.total_amount,0.02);assert.equal(calc.discounts[0].allocations.reduce((s,r)=>s+Math.round(r.amount*100),0),1)
})
test('charge reductions remain targeted to their original service or included item',()=>{
 const calc=calculate({items:[service(100),service(200,2)],discounts:[{key:'reduction',type:'charge_reduction',mode:'fixed',amount:30,target_kind:'service_fee',target_id:1,service_id:1}]})
 assert.equal(calc.total_amount,270);assert.equal(calc.components.find(c=>c.charge_id===2).discount_amount,0)
})
test('unknown classifications, duplicate saved rows and duplicate included charges are blocked',()=>{
 assert.throws(()=>calculate({items:[service(100,99)],policy:policy()}),{code:'TAX_CLASSIFICATION_REQUIRED'})
 assert.throws(()=>calculate({items:[service(),service()]}),{statusCode:409})
 const item=service(300);item.details.materials=Array.from({length:2},()=>({inventory_id:5,material_name:'Dose',quantity:1,charge_quantity:1,charge_unit_price:10}))
 assert.throws(()=>calculate({items:[item]}),{statusCode:409})
})
