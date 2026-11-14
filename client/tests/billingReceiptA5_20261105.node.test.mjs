import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {buildBillingReceiptHtml,getReceiptBreakdown} from '../src/utils/billingReceiptTemplate.mjs'
const baseBill = {
  id:30004,patient_name:'John Pork',doctor_name:'Dr. Magandang Jose C. Carait IV',
  subtotal:627,discount_amount:155,promotion_discount_amount:135,promotion_title_snapshot:'Christmas Promo',approved_courtesy_discount:20,
  total_amount:472,paid_amount:472,balance_amount:0,
  items:[{service_name:'Minor Wound Cleaning and Dressing',quantity:1,unit_price:625,line_total:625},{service_name:'Alcohol Prep Pad 70%',quantity:1,unit_price:2,line_total:2}],
}
const payment = {status:'completed',receipt_number:'OR-BR-86C1EB46CBA24651-20261105-000004',payment_method:'cash',amount:472,paid_at:'2026-11-05 16:52:30',refund_amount:0}
const html = (bill=baseBill,pay=payment,settings={}) => buildBillingReceiptHtml({bill,payment:pay,clinicSettings:settings,logoUrl:'https://caraitclinic.com/logo.png'})
test('renders A5 header, item details, patient and readable receipt number',()=>{
  const s=html()
  for(const fragment of ['@page{size:A5 portrait','CARAIT CLINIC','Payment Receipt','John Pork','Dr. Magandang Jose C. Carait IV','OR-BR-86C1EB46CBA24651-20261105-000004','Minor Wound Cleaning','Alcohol Prep Pad','receipt-id','word-break:break-word']) assert.ok(s.toLowerCase().includes(fragment.toLowerCase()),fragment)
  assert.match(s,/Nov 5, 2026.*4:52.*PHT/)
  assert.match(s,/CARAIT CLINIC/)
})
test('uses saved exact breakdown instead of labeling combined amount as one discount',()=>{
  assert.deepEqual(getReceiptBreakdown(baseBill),{subtotal:627,discount:155,promotion:135,courtesy:20,other:0})
  const s=html()
  for(const fragment of ['₱627.00','₱135.00','₱20.00','₱472.00','Promotion — Christmas Promo','Approved charge reductions']) assert.ok(s.includes(fragment),fragment)
  assert.doesNotMatch(s,/Other discounts/)
})
test('does not invent missing split or mislabel combined legacy discount',()=>{
  const bill={...baseBill,discount_amount:155,promotion_discount_amount:0,approved_courtesy_discount:0,discount_label:'Discounts & adjustments'}
  const s=html(bill)
  assert.match(s,/Discounts &amp; adjustments/)
  assert.doesNotMatch(s,/Approved charge reductions/)
  assert.doesNotMatch(s,/Promotion —/)
})
test('hides n/a fields, escapes untrusted values, no duplicates',()=>{
  const s=html({...baseBill,patient_name:'<script>alert(1)</script>'},{...payment,receipt_number:'A&B'}, {clinic_name:'Laguna Clinic Branch',address:'n/a',phone:'N/A',email:'none',receipt_footer:'Keep & save'})
  assert.ok(s.includes('Laguna Clinic Branch'))
  assert.ok(s.includes('A&amp;B'))
  assert.ok(s.includes('Keep &amp; save'))
  assert.ok(!s.includes('<script>'))
  assert.ok(!s.includes('>n/a<'))
})
test('partial payment identifies the amount received and the outstanding balance',()=>{
  const s=html({...baseBill,paid_amount:100,balance_amount:372},{...payment,amount:100})
  assert.match(s,/PARTIAL PAYMENT/)
  assert.match(s,/Remaining balance/)
  assert.match(s,/₱372.00/)
  assert.match(s,/Amount Paid/)
  assert.match(s,/₱100.00/)
})
test('refunds, partial refunds and voids show their own payment state',()=>{
  assert.match(html(baseBill,{...payment,refund_amount:472}),/\bREFUNDED\b/)
  const part=html(baseBill,{...payment,refund_amount:100,refund_reason:'Duplicate charge'})
  assert.match(part,/PARTIALLY REFUNDED/)
  assert.match(part,/Amount Paid/)
  assert.match(part,/Net this payment/)
  assert.match(part,/Refund reason/)
  assert.match(html(baseBill,{...payment,status:'voided',void_reason:'Wrong method'}),/VOIDED/)
})

test('cash receipt prints saved amount paid, tender and change',()=>{
  const s=html(baseBill,{...payment,amount_received:'500.00',change_amount:'28.00'})
  assert.match(s,/Amount Paid<\/span><strong>₱472.00/)
  assert.match(s,/Cash Received<\/span><strong>₱500.00/)
  assert.match(s,/Change<\/span><strong>₱28.00/)
  assert.doesNotMatch(s,/Remaining balance/)
})

test('online receipts omit cash received and change even when the fields are populated',()=>{
  for (const payment_method of ['qrph','gcash','maya','bank_transfer']) {
    const s=html(baseBill,{...payment,payment_method,amount_received:500,change_amount:28})
    assert.match(s,/Amount Paid<\/span><strong>₱472.00/)
    assert.doesNotMatch(s,/Cash Received|>Change<|Remaining balance/)
  }
})

test('legacy cash receipts do not invent missing tender or change',()=>{
  const s=html(baseBill,{...payment,amount_received:null,change_amount:null})
  assert.match(s,/Cash Received<\/span><strong>Not recorded/)
  assert.match(s,/Change<\/span><strong>Not recorded/)
})
test('many items remain printable across pages and use header-repeat table rules',()=>{
  const big={...baseBill,items:Array.from({length:50},(_,i)=>({service_name:`Service ${i} ${'long '.repeat(7)}`,quantity:1,unit_price:2,line_total:2}))}
  const s=html(big)
  assert.match(s,/display:table-header-group/)
  assert.match(s,/break-inside:avoid/)
  assert.ok(s.includes('Service 49'))
})
test('receipt printing uses one shared renderer across all billing portals',()=>{
  const root=new URL('../src/',import.meta.url)
  for(const rel of ['pages/patientPage/History.jsx','pages/adminPage/Admin_CheckoutDetail.jsx','pages/staffPage/Staff_CheckoutDetail.jsx','components/billing/BillHistoryDetail.jsx','pages/adminPage/Admin_BillingReceiptSettings.jsx']) {
    const source=fs.readFileSync(new URL(rel,root),'utf8')
    assert.match(source,/printBillingReceipt/)
  }
  assert.match(fs.readFileSync(new URL('utils/billingReceipt.js',root),'utf8'),/buildBillingReceiptHtml/)
})
test('print entry point opens printable popup once and reports blocked popup',async()=>{
  const {printBillingReceipt}=await import('../src/utils/billingReceipt.js')
  let onload,html,printCount=0
  globalThis.window={location:{origin:'https://caraitclinic.com'},open:()=>({document:{open(){},write(s){html=s},close(){}},set onload(cb){onload=cb},focus(){},print(){printCount++}})}
  assert.equal(printBillingReceipt({bill:baseBill,payment}),true)
  assert.ok(html.includes('https://caraitclinic.com/logo.png'))
  assert.equal(printCount,0)
  onload();onload()
  assert.equal(printCount,1)
  let warned=0
  globalThis.window.open=()=>null
  assert.equal(printBillingReceipt({bill:baseBill,payment,onPopupBlocked:()=>warned++}),false)
  assert.equal(warned,1)
  delete globalThis.window
})
