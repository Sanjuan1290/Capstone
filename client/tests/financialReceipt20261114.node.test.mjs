import test from 'node:test'
import assert from 'node:assert/strict'
import finance from '../../server/utils/billingCalculation.js'
import {buildBillingReceiptHtml} from '../src/utils/billingReceiptTemplate.mjs'
import {receiptPaymentTimeline} from '../src/utils/receiptPaymentTimeline.mjs'
const items=[{id:1,item_type:'service',catalog_service_id:1,service_name:'Animal Bite Vaccination',quantity:1,unit_price:3099,line_total:3099,details:{pricing:{original_price:3099,doctor_fee_percentage:20},materials:[{inventory_id:8,material_name:'Vaccine',quantity:1,charge_quantity:1,charge_unit_price:2099}]}}]
const calc=finance.calculateFinancialBill({items})
const payment={id:1,status:'completed',amount:3099,amount_received:3500,change_amount:401,payment_method:'cash',paid_at:'2026-11-14 10:00:00'}
const bill={id:5,items,subtotal:3099,total_amount:3099,discount_amount:0,paid_amount:3099,balance_amount:0,financial_calculation:calc,payments:[payment]}
test('printed receipt uses saved item amounts and included doctor fee without increasing the bill',()=>{
 const html=buildBillingReceiptHtml({bill,payment})
 assert.match(html,/Vaccine \(Included\)/);assert.match(html,/₱2,099.00/);assert.match(html,/₱1,000.00/);assert.match(html,/619.80/);assert.match(html,/Included in Subtotal/);assert.match(html,/Tax not applied/);assert.doesNotMatch(html,/Clinic.*[Ss]hare/)
 assert.match(html,/Bill Total<\/span><strong>₱3,099.00/)
})
test('each partial receipt retains its own received payment and balance after that transaction',()=>{
 const first={...payment,amount:1000,amount_received:1500,change_amount:500},second={...payment,id:2,amount:2099,payment_method:'gcash',paid_at:'2026-11-14 11:00:00'}
 const paid={...bill,payments:[second,first]}
 assert.deepEqual(receiptPaymentTimeline(paid,first),{previous_paid:0,paid_through:1000,balance:2099})
 assert.deepEqual(receiptPaymentTimeline(paid,second),{previous_paid:1000,paid_through:3099,balance:0})
 const html=buildBillingReceiptHtml({bill:paid,payment:first});assert.match(html,/PARTIAL PAYMENT/);assert.match(html,/Amount Paid<\/span><strong>₱1,000.00/);assert.match(html,/Remaining balance<\/span><strong>₱2,099.00/)
 const online=buildBillingReceiptHtml({bill:paid,payment:second});assert.match(online,/Previous payments/);assert.doesNotMatch(online,/>Change<|Cash Received/)
})
test('saved exclusive tax is printed without live configuration or frontend repricing',()=>{
 const calculation={...calc,subtotal:100,discount_amount:0,total_amount:112,tax:{enabled:true,name:'VAT',rate:12,mode:'exclusive',taxable_amount:100,vat_exempt_amount:0,vat_relief:0,amount:12,added_amount:12}}
 const html=buildBillingReceiptHtml({bill:{...bill,total_amount:112,financial_calculation:calculation},payment:{...payment,amount:112}})
 assert.match(html,/VAT \(12%, exclusive\)/);assert.match(html,/₱12.00/);assert.match(html,/Bill Total<\/span><strong>₱112.00/)
})
