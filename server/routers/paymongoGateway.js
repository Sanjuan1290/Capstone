'use strict'
const express = require('express')
const db = require('../db/connect')
const { createQr, retrieveIntent, credentials, fail } = require('../utils/paymongoClient')
const { verifyPaymongoSignature } = require('../utils/paymongoWebhookSignature')
const { getBillingRecordWithItems } = require('../utils/billing')
const { writeAuditLog } = require('../utils/audit')
const staffCtrl = require('../controllers/staff.controller')
const { broadcast } = require('../utils/sse')

const apiRouter = express.Router()
const knownStatus = new Set(['creating','pending','succeeded','failed','expired','review'])
const http = (code, message, status = 409) => Object.assign(new Error(message), {statusCode: status, code})
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0
const isTestSimulationUrl = url => {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === 'paymongo.com' || parsed.hostname.endsWith('.paymongo.com')) }
  catch { return false }
}
const publicAttempt = row => ({
  id: Number(row.id), billing_id:Number(row.billing_id), branch_id: Number(row.branch_id),
  mode: 'test', status: row.status, amount: Number(row.amount_centavos)/100,
  expires_at: row.expires_at, qr_image: row.status === 'pending' ? row.qr_image : null,
  test_url: row.status === 'pending' && isTestSimulationUrl(row.test_url) ? row.test_url : null,
  error_code: row.error_code || null,
})
const getLatest = async (billId, branchId) => {
  const [[row]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE billing_id=? AND branch_id=? ORDER BY id DESC LIMIT 1', [billId,branchId])
  return row || null
}

const makeQr = async (req, res) => {
  credentials() // fail closed until valid test keys supplied; never create live payment
  if (!String(process.env.PAYMONGO_WEBHOOK_SECRET || '').startsWith('whsk_')) throw http('PAYMONGO_WEBHOOK_NOT_CONFIGURED','Configure the PayMongo test webhook signing secret before generating QR payments.',503)
  const billId = Number(req.params.id), branchId = Number(req.branchId)
  if (!validId(billId) || !validId(branchId)) throw http('BRANCH_REQUIRED','Valid branch and bill are required.',400)
  const conn = await db.getConnection()
  let attempt
  try {
    await conn.beginTransaction()
    const [[locked]] = await conn.query('SELECT * FROM billing_records WHERE id=? AND branch_id=? LIMIT 1 FOR UPDATE', [billId,branchId])
    if (!locked) throw http('BILL_NOT_FOUND','Bill not found in this clinic branch.',404)
    if (!['ready','partially_paid'].includes(locked.status)) throw http('BILL_NOT_READY','Confirm the bill before generating its QR.')
    const bill = await getBillingRecordWithItems(billId, conn)
    const amountCentavos = Math.round(Number(bill.balance_amount)*100)
    if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 100) throw http('INVALID_QR_AMOUNT','The remaining balance must be at least ₱1.00.')
    const [[existing]] = await conn.query('SELECT * FROM payment_gateway_attempts WHERE active_bill_id=? LIMIT 1 FOR UPDATE', [billId])
    if (existing) {
      await conn.commit()
      return res.json(publicAttempt(existing))
    }
    const [created] = await conn.query(`INSERT INTO payment_gateway_attempts
      (billing_id,branch_id,bill_version,amount_centavos,active_bill_id,created_by_role,created_by_id)
      VALUES (?,?,?,?,?,?,?)`,[billId,branchId,locked.version,amountCentavos,billId,req.adminContext?.account_role==='superadmin'?'superadmin':req.user.role,req.user.id])
    attempt = { id: created.insertId, amountCentavos }
    await conn.commit()
  } catch (error) { await conn.rollback().catch(()=>{}); throw error }
  finally { conn.release() }
  try {
    const qr = await createQr({amountCentavos:attempt.amountCentavos,billId,attemptId:attempt.id,
      onIntentCreated: intentId => db.query('UPDATE payment_gateway_attempts SET payment_intent_id=? WHERE id=? AND payment_intent_id IS NULL',[intentId,attempt.id]) })
    await db.query(`UPDATE payment_gateway_attempts SET status='pending',payment_intent_id=?,qr_image=?,test_url=?,expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE id=? AND status='creating'`,
      [qr.intentId,qr.qrImage,isTestSimulationUrl(qr.testUrl)?qr.testUrl:null,attempt.id])
    const [[saved]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE id=?',[attempt.id])
    return res.status(201).json(publicAttempt(saved))
  } catch (error) {
    // Network errors are indeterminate: hold the attempt for reconciliation rather
    // than allowing a second QR that could charge the patient twice.
    await db.query("UPDATE payment_gateway_attempts SET status='review',error_code=? WHERE id=? AND status='creating'",[String(error.code || 'PAYMONGO_UNKNOWN').slice(0,60),attempt.id]).catch(()=>{})
    throw error
  }
}
const status = async (req,res) => {
  const billId = Number(req.params.id), branchId = Number(req.branchId)
  if (!validId(billId) || !validId(branchId)) throw http('INVALID_BILL','Invalid bill.',400)
  const [[owned]] = await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=? LIMIT 1',[billId,branchId])
  if (!owned) throw http('BILL_NOT_FOUND','Bill not found in this branch.',404)
  const attempt = await getLatest(billId,branchId)
  res.json(attempt ? publicAttempt(attempt) : {status:'not_created'})
}
apiRouter.post('/:id/qr-payment', (req,res,next)=>Promise.resolve(makeQr(req,res)).catch(next))
apiRouter.get('/:id/qr-payment/status', (req,res,next)=>Promise.resolve(status(req,res)).catch(next))

// Called ONLY after signature, test-mode, intent and amount verification.
// Reuse CARAIT's existing single-payment transaction for receipt allocation and
// per-batch dispensing, with a backend-only verified provider context.
async function settleThroughExistingCheckout(attempt,payment) {
  const payId = String(payment.id)
  const req = {
    user: { role:'staff', id:null }, branchId: Number(attempt.branch_id),
    params:{id: String(attempt.billing_id)}, ip:null,
    gatewayVerified: { provider:'paymongo', intentId:attempt.payment_intent_id, paymentId:payId },
    body:{ payment_method:'qrph', payment_amount:Number(attempt.amount_centavos)/100,
      reference_number:payId, idempotency_key:`paymongo:${payId}`, payment_notes:'Verified PayMongo QR Ph test payment' },
  }
  let outcome = null, code = 200
  const res = { status(value){code=value;return this}, json(value){outcome=value;return this} }
  await staffCtrl.payBill(req,res)
  if (code >= 400 || !outcome) throw http('PAYMENT_RECONCILIATION_REQUIRED', outcome?.message || 'Provider payment could not be reconciled to the bill.',409)
  const [[recorded]] = await db.query('SELECT id FROM billing_payments WHERE billing_id=? AND idempotency_key=? LIMIT 1',[attempt.billing_id,`paymongo:${payId}`])
  if (!recorded) throw http('PAYMENT_RECORD_MISSING','Provider payment did not create a local receipt.',503)
  return recorded.id
}
async function handleWebhookEvent(event) {
  const eid = String(event?.data?.id || '')
  const attrs = event?.data?.attributes
  const type = String(attrs?.type || '')
  if (!/^evt_[a-zA-Z0-9_-]{4,115}$/.test(eid) || attrs?.livemode !== false) throw http('INVALID_PAYMONGO_EVENT','Invalid test payment event.',400)
  if (!['payment.paid','payment.failed','qrph.expired'].includes(type)) return {ignored:true}
  const payment = attrs.data
  const paymentAttrs = payment?.attributes || {}
  const intentId = String(paymentAttrs.payment_intent_id || '')
  if (!intentId) return {ignored:true}
  const [[attempt]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE payment_intent_id=? LIMIT 1',[intentId])
  if (!attempt) return {ignored:true}
  await db.query(`INSERT IGNORE INTO payment_gateway_webhook_events (event_id,attempt_id,event_type) VALUES (?,?,?)`,[eid,attempt.id,type])
  const [[savedEvent]] = await db.query('SELECT status FROM payment_gateway_webhook_events WHERE event_id=?',[eid])
  if (savedEvent?.status === 'processed') return {duplicate:true}
  if (type !== 'payment.paid') {
    // Failure/expiry must not override a succeeded payment. A failed method can
    // have another attempt pending; do not assume the whole intent is terminal.
    if (type === 'qrph.expired') await db.query("UPDATE payment_gateway_attempts SET status='expired',active_bill_id=NULL WHERE id=? AND status='pending'",[attempt.id])
    await db.query("UPDATE payment_gateway_webhook_events SET status='processed',processed_at=NOW() WHERE event_id=?",[eid])
    return {processed:true}
  }
  if (paymentAttrs.livemode !== false || paymentAttrs.status !== 'paid'
      || String(paymentAttrs.currency).toUpperCase() !== 'PHP'
      || String(paymentAttrs.source?.type || '').toLowerCase() !== 'qrph'
      || Number(paymentAttrs.amount) !== Number(attempt.amount_centavos)
      || !String(payment.id || '').startsWith('pay_')) throw http('PAYMENT_AMOUNT_MISMATCH','Provider payment details do not match the original QR amount.')
  // Do not trust a signed fixture/event alone; independently retrieve the intent.
  const intent = await retrieveIntent(intentId)
  if (intent.id !== intentId || intent.attributes?.livemode !== false || intent.attributes?.status !== 'succeeded'
      || Number(intent.attributes?.amount) !== Number(attempt.amount_centavos)
      || String(intent.attributes?.currency).toUpperCase() !== 'PHP') throw http('PAYMENT_NOT_CONFIRMED','The PayMongo intent is not confirmed as paid.',409)
  let receiptId
  if (attempt.status === 'succeeded') {
    const [[old]] = await db.query('SELECT id FROM billing_payments WHERE billing_id=? AND idempotency_key=? LIMIT 1',[attempt.billing_id,`paymongo:${payment.id}`])
    if (!old) throw http('PAYMENT_RECONCILIATION_REQUIRED','Missing receipt for previously settled gateway attempt.')
    receiptId = old.id
  } else {
    receiptId = await settleThroughExistingCheckout(attempt,payment)
  }
  await db.query(`UPDATE payment_gateway_attempts SET status='succeeded',active_bill_id=NULL,
    qr_image=NULL,provider_payment_id=?,settled_payment_id=?,error_code=NULL WHERE id=? AND (provider_payment_id IS NULL OR provider_payment_id=?)`,[payment.id,receiptId,attempt.id,payment.id])
  await db.query("UPDATE payment_gateway_webhook_events SET status='processed',processed_at=NOW(),error_code=NULL WHERE event_id=?",[eid])
  broadcast(['admin','staff'],'billing_paid',{billingId:attempt.billing_id,provider:'paymongo'},{branchId:attempt.branch_id})
  return {processed:true}
}
const rawWebhook = async (req,res) => {
  if (process.env.PAYMONGO_MODE !== 'test' || !String(process.env.PAYMONGO_SECRET_KEY||'').startsWith('sk_test_')) return res.status(503).json({code:'PAYMONGO_DISABLED'})
  if (!verifyPaymongoSignature(req.body,req.get('paymongo-signature'),process.env.PAYMONGO_WEBHOOK_SECRET)) return res.status(401).json({code:'INVALID_WEBHOOK_SIGNATURE'})
  let event
  try { event=JSON.parse(req.body.toString('utf8')) }
  catch {return res.status(400).json({code:'INVALID_JSON'})}
  try {return res.json(await handleWebhookEvent(event))}
  catch (error) {
    console.error('[paymongo-reconciliation]',{code:error.code,message:error.message,eventId:event?.data?.id})
    return res.status(error.statusCode || 503).json({code:error.code||'RETRY_LATER'})
  }
}
module.exports = { apiRouter, rawWebhook, handleWebhookEvent, publicAttempt, isTestSimulationUrl }
