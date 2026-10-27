import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculatePaymentPreview } from '../src/utils/paymentPreview.mjs'
const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('cash estimate shows ₱4 change on ₱1 payment without changing persisted bill', () => {
  const bill = Object.freeze({ total_amount: 1, paid_amount: 0, balance_amount: 1 })
  const preview = calculatePaymentPreview({ bill, draft: { payment_method: 'cash', payment_amount: '1.00', amount_received: '5.00' } })
  assert.deepEqual(preview, {valid:true, amount:1, isCash:true, cashReceived:5, change:4, balanceAfter:0})
  assert.equal(bill.paid_amount,0)
})
test('partial payment uses outstanding balance and centavo precision', () => {
  const preview = calculatePaymentPreview({ bill: { total_amount:3050, paid_amount:400, balance_amount:2650 }, draft: {payment_method:'cash',payment_amount:'1000',amount_received:'1500'} })
  assert.equal(preview.valid,true)
  assert.equal(preview.balanceAfter,1650)
  assert.equal(preview.change,500)
  assert.equal(calculatePaymentPreview({bill:{balance_amount:0.3},draft:{payment_method:'gcash',payment_amount:'0.10'}}).balanceAfter,0.2)
})
test('noncash estimate never displays cash received/change', () => {
  const preview=calculatePaymentPreview({bill:{balance_amount:100},draft:{payment_method:'gcash',payment_amount:'30.00'}})
  assert.equal(preview.valid,true)
  assert.equal(preview.isCash,false)
  assert.equal(preview.change,null)
  assert.equal(preview.cashReceived,null)
})
test('invalid, over-balance and insufficient cash amounts are rejected', () => {
  const data=[['', '0'],['-1','2'],['1.234','5'],['101','120'],['NaN','1'],['Infinity','2'],['50','49'],['10',''],['1e2','200']]
  for(const [amount,tendered] of data){
    assert.equal(calculatePaymentPreview({bill:{balance_amount:100},draft:{payment_method:'cash',payment_amount:amount,amount_received:tendered}}).valid,false,`invalid ${amount}/${tendered}`)
  }
})
test('both Staff and Admin render the same isolated estimated preview', () => {
  for(const page of ['pages/adminPage/Admin_CheckoutDetail.jsx','pages/staffPage/Staff_CheckoutDetail.jsx']){
    const source=read(page)
    assert.match(source,/import PaymentPreview from/)
    assert.match(source,/<PaymentPreview bill=\{bill\} draft=\{draft\} formatMoney=\{formatMoney\}/)
    assert.match(source,/formatMoney\(bill\.paid_amount\)/)
    assert.match(source,/formatMoney\(bill\.balance_amount\)/)
  }
  assert.doesNotMatch(read('components/billing/PaymentPreview.jsx'),/payBill\(|recordPayment\(|setDraft\(/)
})
test('dark-mode components explicitly handle translucent and weekday surfaces', () => {
  assert.match(read('components/NotificationBell.jsx'),/bg-sky-50\/60 dark:bg-sky-950\/50/)
  assert.match(read('components/schedule/ScheduleDayCard.jsx'),/bg-indigo-50 dark:bg-slate-800/)
  assert.match(read('components/accounts/StaffPermissionPicker.jsx'),/bg-amber-50\/50 dark:border-amber-700 dark:bg-amber-950\/40/)
})
test('doctor availability sorts weekdays while preserving booking routes', () => {
  const source=read('pages/patientPage/DoctorAvailability.jsx')
  assert.match(source,/WEEKDAY_ORDER = \['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'\]/)
  assert.match(source,/sortWeeklySchedule\(/)
  assert.match(source,/buildSlotBookingPath/)
})
test('featured offers preserve selected promotion while providing bounded scroll controls', () => {
  const source=read('components/promotions/PromotionCards.jsx')
  assert.match(source,/promotion_id=\$\{encodeURIComponent\(p\.id\)\}/)
  assert.match(source,/disabled=\{edge\.first\}/)
  assert.match(source,/disabled=\{edge\.last\}/)
  assert.match(source,/prefers-reduced-motion/)
  assert.match(source,/ResizeObserver/)
})

