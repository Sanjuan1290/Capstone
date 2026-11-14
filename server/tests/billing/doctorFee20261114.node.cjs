const test=require('node:test'),assert=require('node:assert/strict')
const {doctorFeeAllocations}=require('../../utils/doctorFeeAllocation')
const {percentage,cents,fromCents,percentOf,multiply}=require('../../utils/billingMoney')
const service=(subtotal,rate,extra={})=>({item_type:'service',service_name:'Vaccination',quantity:1,unit_price:subtotal,line_total:subtotal,details:{pricing:{original_price:subtotal,doctor_fee_percentage:rate}},...extra})
test('doctor fee includes listed items in the original subtotal and never changes the payable charge',()=>{
 const item=service(3099,20),before=JSON.stringify(item),[result]=doctorFeeAllocations([item])
 assert.equal(result.doctor_fee_amount,619.8);assert.equal(result.clinic_base_share,2479.2);assert.equal(item.line_total,3099);assert.equal(JSON.stringify(item),before)
})
test('multiple services have independent rates and quantities; additional items are not counted twice',()=>{
 const rows=doctorFeeAllocations([service(3099,20),service(500,10,{quantity:2}),service(100,0),{item_type:'supply',line_total:900}])
 assert.deepEqual(rows.map(r=>r.doctor_fee_amount),[619.8,100,0])
})
test('reductions do not change the allocation base and legacy services default to zero',()=>{
 assert.equal(doctorFeeAllocations([service(3099,20,{line_total:2899,unit_price:2899})])[0].doctor_fee_amount,619.8)
 assert.equal(doctorFeeAllocations([{item_type:'service',quantity:1,unit_price:100}])[0].doctor_fee_amount,0)
})
test('percentages validate both boundaries and precision',()=>{
 for(const rate of [0,'20.25',100])assert.equal(percentage(rate),Number(rate))
 for(const rate of [-1,101,'no',0.001])assert.throws(()=>percentage(rate),{statusCode:400})
})
test('decimal arithmetic rounds half-up without binary summation errors',()=>{
 assert.equal(fromCents(cents('0.1')+cents('0.2')),0.3)
 assert.equal(fromCents(cents('1.005')),1.01)
 assert.equal(fromCents(percentOf(cents('3099'),20)),619.8)
 assert.equal(fromCents(multiply(cents('99.99'),3)),299.97)
})
