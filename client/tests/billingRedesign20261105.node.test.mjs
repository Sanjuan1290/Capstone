import {readFileSync} from 'node:fs'
import {paymentRequestKey} from '../src/utils/paymentRequest.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {manualAppointmentPayload} from '../src/utils/manualAppointment.mjs'
import {supplyQuantityError} from '../src/utils/supplyQuantity.mjs'
import {consultationPriceBreakdown} from '../src/utils/consultationPricing.mjs'
import {billingPortal,billPaymentLabel} from '../src/utils/billingPortal.mjs'
const raw={patient_id:'4',doctor_id:3,requested_service_id:77,clinic_type:'medical',appointment_date:'2026-11-05',appointment_time:'10:00',reason:'Follow up',notes:'',override_no_show_warning:false}
test('manual booking accepts primitives and keeps every selection without serializing React objects',()=>{
 const event={target:{}};event.target.event=event
 const result=manualAppointmentPayload({...raw,clickEvent:event});assert.deepEqual(JSON.parse(JSON.stringify(result)),{...raw,patient_id:4})
 assert.throws(()=>manualAppointmentPayload({...raw,override_no_show_warning:event}),/warning/)
 assert.throws(()=>manualAppointmentPayload({...raw,notes:event}),/details/)
 assert.equal(manualAppointmentPayload({...raw,override_no_show_warning:true}).override_no_show_warning,true)
})
test('whole quantities and configured fractional precision are validated consistently',()=>{
 assert.equal(supplyQuantityError(2,{}),'');assert.ok(supplyQuantityError(1.09,{}))
 assert.equal(supplyQuantityError(1.09,{uom_allow_decimal:1,uom_decimal_precision:2}),'')
 assert.ok(supplyQuantityError(1.09,{uom_allow_decimal:1,uom_decimal_precision:1}))
 for(const qty of [0,-1,NaN,Infinity,'',[],{},1.001])assert.ok(supplyQuantityError(qty,{uom_allow_decimal:1}))
})
test('included usage changes keep service charge stable, while promotion and explicit extras remain itemized',()=>{
 const catalog={default_price:540},inventory=[{id:1,selling_price:5},{id:2,selling_price:10,uom_allow_decimal:1,uom_decimal_precision:2}]
 const price=qty=>consultationPriceBreakdown({materials:[{inventory_id:1,quantity:qty}]},catalog,inventory,{discount_amount:135})
 assert.deepEqual(price(1),{service:540,promotion:135,supplies:0,total:405});assert.deepEqual(price(2),price(1))
 assert.deepEqual(consultationPriceBreakdown({materials:[{inventory_id:2,quantity:1.09,consultation_extra:true}]},catalog,inventory,{discount_amount:135}),{service:540,promotion:135,supplies:10.9,total:415.9})
 assert.equal(price(1.09),null)
})
test('billing portal retains Staff, Admin and selected Super Admin branch paths',()=>{
 assert.equal(billingPortal('/superadmin/branches/3/billing').api,'/api/branches/workspace/3/legacy')
 assert.equal(billingPortal('/staff/checkout').admin,false);assert.equal(billingPortal('/admin/billing').api,'/api/branches/my/legacy')
})
test('partial balances never look paid and failure is attached to the attempt',()=>{
 assert.equal(billPaymentLabel({status:'partially_paid',total_amount:405,paid_amount:100,balance_amount:305}),'Partially paid')
 assert.equal(billPaymentLabel({status:'ready',total_amount:405,balance_amount:405,attempt_status:'failed'}),'Payment attempt failed')
 assert.equal(billPaymentLabel({status:'paid',balance_amount:0}),'Paid in full')
 assert.notEqual(billPaymentLabel({status:'paid',balance_amount:5}),'Paid in full')
})

test('response retries reuse the payment key across checkout instances; a new balance gets a new key',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let count=0
 const create=()=>`key-${++count}`
 assert.equal(paymentRequestKey(storage,'bill-6','balance405-cash100',create),'key-1')
 assert.equal(paymentRequestKey(storage,'bill-6','balance405-cash100',create),'key-1')
 assert.equal(paymentRequestKey(storage,'bill-6','balance305-cash100',create),'key-2')
 assert.equal(count,2)
})

test('Staff and Admin wrappers bind one shared checkout to their own permitted APIs',()=>{
 const read=name=>readFileSync(new URL(`../src/pages/${name}`,import.meta.url),'utf8')
 const admin=read('adminPage/Admin_CheckoutDetail.jsx'),staff=read('staffPage/Staff_CheckoutDetail.jsx')
 assert.match(admin,/<BillCheckout services=\{services\} admin/);assert.match(admin,/api.finalizeAdminCheckoutBill/)
 assert.match(staff,/<BillCheckout services=\{services\}/);assert.match(staff,/services\/staff.service/)
 assert.doesNotMatch(staff,/services\/admin.service/)
})

test('measured extra-supply estimates round half cents the same way as backend billing',()=>{
 assert.deepEqual(consultationPriceBreakdown({materials:[{inventory_id:8,quantity:0.1,consultation_extra:true}]},{default_price:540},[{id:8,selling_price:0.35,uom_allow_decimal:1,uom_decimal_precision:2}],{discount_amount:135}),{service:540,promotion:135,supplies:0.04,total:405.04})
})
