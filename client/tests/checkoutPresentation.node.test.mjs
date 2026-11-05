import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { checkoutNotice, checkoutOverviewValues } from '../src/utils/checkoutPresentation.mjs'
const dir = path.dirname(fileURLToPath(import.meta.url))
const read = file => fs.readFileSync(path.resolve(dir, `../src/${file}`), 'utf8')

test('doctor requests reductions without approving or rejecting financial changes',()=>{
 assert.match(read('pages/doctorPage/Doctor_Consultation.jsx'),/<DoctorChargeReductionPanel/)
 const panel=read('components/billing/DoctorChargeReductionPanel.jsx')
 assert.match(panel,/requestClinicalChargeAdjustment/);assert.match(panel,/Pending Billing Approval/)
 assert.doesNotMatch(panel,/>Approve<|>Reject<|method:'PATCH'/)
 const route=fs.readFileSync(path.resolve(dir,'../../server/routers/doctor.router.js'),'utf8')
 assert.match(route,/router.post\('\/consultations\/:appointmentId\/charge-adjustments'/)
 assert.doesNotMatch(route,/router.patch\('\/consultations\/:appointmentId\/charge-adjustments/)
})

test('cashier and admin checkout use shared status and workflow presentation', () => {
 for (const file of ['components/billing/BillCheckout.jsx','components/billing/BillCheckout.jsx']) {
  const content=read(file)
  for (const key of ['<CheckoutProgress','<CheckoutStatus','<CheckoutOverview','checkout-stage-enter','<ChargeAdjustmentsPanel','requestPay','recordPayment']) assert.ok(content.includes(key), `${file}: ${key}`)
  assert.ok(!content.includes('const Stepper ='), `${file}: old stepper still present`)
 }
})

test('checkout status prioritizes conflicts, busy operations and unsaved edits', () => {
 const bill = {status:'ready'}
 assert.equal(checkoutNotice({bill, versionConflict:true, paying:true}).kind,'warning')
 assert.equal(checkoutNotice({bill, paying:true}).title,'Recording payment…')
 assert.equal(checkoutNotice({bill, qrPending:true}).kind,'payment')
 assert.equal(checkoutNotice({bill, dirty:true}).tone,'amber')
})

test('payment statuses describe only server-confirmed states', () => {
 assert.match(checkoutNotice({bill:{status:'ready'}}).title,/ready for payment/)
 assert.match(checkoutNotice({bill:{status:'partially_paid'}}).title,/Partial payment/)
 assert.match(checkoutNotice({bill:{status:'paid'}}).title,/Payment complete/)
 assert.equal(checkoutNotice({bill:{status:'voided'}}).tone,'slate')
 assert.equal(checkoutNotice({bill:{status:'draft'}}).kind,'info')
})

test('draft totals are preview only; confirmed totals come from saved bill', () => {
 assert.deepEqual(checkoutOverviewValues({bill:{status:'draft',total_amount:500,paid_amount:0,balance_amount:500},totals:{total:360}}), {draft:true,total:360,paid:0,balance:360})
 assert.deepEqual(checkoutOverviewValues({bill:{status:'partially_paid',total_amount:500,paid_amount:200,balance_amount:300},totals:{total:400}}), {draft:false,total:500,paid:200,balance:300})
})

test('charge adjustment UI preserves approval, reason and stock separation notices', () => {
 const panel=read('components/billing/ChargeAdjustmentsPanel.jsx')
 for(const text of ['Request Charge Reduction','Approve','Reject','approved reductions','onUpdated','busy']) assert.ok(panel.includes(text),text)
})

test('animations honor reduced motion settings', () => {
 const css=read('components/billing/checkoutExperience.css')
 assert.match(css,/prefers-reduced-motion/)
 assert.match(css,/animation: none/)
})
