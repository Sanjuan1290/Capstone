import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url),'utf8')
test('both checkout portals supply branch scoped cancellation to the shared QR panel',()=>{
 const a=src('pages/adminPage/Admin_CheckoutDetail.jsx'),s=src('pages/staffPage/Staff_CheckoutDetail.jsx')
 assert.match(a,/cancelQr=\{cancelAdminQrPayment\}/)
 assert.match(s,/cancelQr=\{cancelStaffQrPayment\}/)
 assert.match(src('services/admin.service.js'),/getAdminApiBase\(\).*qr-payment\/\$\{attemptId\}\/cancel/)
 assert.match(src('services/staff.service.js'),/qr-payment\/\$\{attemptId\}\/cancel/)
})
test('QR cancel button is guarded by server capability; no optimistic manual-unlock after request',()=>{
 const p=src('components/billing/QrPhPaymentPanel.jsx')
 assert.match(p,/attempt\?\.can_request_cancel && cancelQr/)
 assert.match(p,/setAttempt\(result\)/)
 assert.match(p,/result\?\.status !== 'cancelled'/)
 assert.match(p,/Cash remains blocked unless PayMongo confirms cancellation/)
 assert.doesNotMatch(p,/setQrPending\(false\)/)
})
