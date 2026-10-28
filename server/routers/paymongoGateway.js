'use strict'
const express = require('express')
const db = require('../db/connect')
const { createQr, retrieveIntent, retrieveRefund, cancelIntent, credentials, fail } = require('../utils/paymongoClient')
const { assertVerifiedQrRefund } = require('../utils/paymongoRefundVerification')
const { verifyPaymongoSignature } = require('../utils/paymongoWebhookSignature')
const { getBillingRecordWithItems } = require('../utils/billing')
const { writeAuditLog } = require('../utils/audit')
const staffCtrl = require('../controllers/staff.controller')
const { broadcast } = require('../utils/sse')
const { configuredMode, expectedLive, supportsMode, isLiveCollectionEnabled, sameConfiguredMode } = require('../utils/paymongoMode')

const apiRouter = express.Router()
const knownStatus = new Set(['creating','pending','succeeded','failed','expired','review','refunded','cancelled'])
const http = (code, message, status = 409) => Object.assign(new Error(message), {statusCode: status, code})
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0
const isTestSimulationUrl = url => {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === 'paymongo.com' || parsed.hostname.endsWith('.paymongo.com')) }
  catch { return false }
}
const cancellationEnabled = row => process.env.PAYMONGO_QR_CANCEL_ENABLED === 'true'
  && (String(row?.mode || 'test') === 'test' || process.env.PAYMONGO_QR_CANCEL_LIVE_ENABLED === 'true')
  && sameConfiguredMode(row)
const canRequestCancel = row => Boolean(row && row.active_bill_id && row.payment_intent_id && !row.provider_payment_id
  && ['pending','review'].includes(row.status) && cancellationEnabled(row))
const canCollectAlternate = row => !row || (!row.active_bill_id && ['cancelled','expired','failed','refunded','succeeded'].includes(row.status))
const publicAttempt = row => ({
  id: Number(row.id), billing_id:Number(row.billing_id), branch_id: Number(row.branch_id),
  mode: String(row.mode || 'test'), current_mode: configuredMode() || null,
  enabled: configuredMode() === 'test' || isLiveCollectionEnabled(),
  status: row.status, amount: Number(row.amount_centavos)/100,
  expires_at: row.expires_at, qr_image: row.status === 'pending' ? row.qr_image : null,
  test_url: String(row.mode || 'test') === 'test' && row.status === 'pending' && isTestSimulationUrl(row.test_url) ? row.test_url : null,
  error_code: row.error_code || null,
  can_request_cancel: canRequestCancel(row), can_collect_alternate: canCollectAlternate(row),
  needs_admin_review: row.status === 'review' || Boolean(row.active_bill_id && !row.payment_intent_id),
})
const getLatest = async (billId, branchId) => {
  const [[row]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE billing_id=? AND branch_id=? ORDER BY id DESC LIMIT 1', [billId,branchId])
  return row || null
}

const makeQr = async (req, res) => {
  const { mode } = credentials()
  if (mode === 'live' && !isLiveCollectionEnabled()) throw http('PAYMONGO_LIVE_NOT_ENABLED','Live QR collection is not activated yet.',503)
  if (!String(process.env.PAYMONGO_WEBHOOK_SECRET || '').startsWith('whsk_')) throw http('PAYMONGO_WEBHOOK_NOT_CONFIGURED','Configure the webhook signing secret for the active PayMongo mode.',503)
  const billId = Number(req.params.id), branchId = Number(req.branchId)
  if (!validId(billId) || !validId(branchId)) throw http('BRANCH_REQUIRED','Valid branch and bill are required.',400)
  // Never release a bill lock based only on local expiry or missing provider identifiers.
  const [[stale]] = await db.query('SELECT a.id FROM payment_gateway_attempts a JOIN billing_records b ON b.id=a.billing_id WHERE a.active_bill_id=? AND b.branch_id=? LIMIT 1',[billId,branchId])
  if (stale) await reconcileAttempt(stale.id,{force:true}).catch(error=>console.warn('[paymongo-reconciliation] pre-QR check failed',{attemptId:stale.id,code:error.code}))
  const conn = await db.getConnection()
  let attempt
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
    await conn.beginTransaction()
    const [[locked]] = await conn.query('SELECT * FROM billing_records WHERE id=? AND branch_id=? LIMIT 1 FOR UPDATE', [billId,branchId])
    if (!locked) throw http('BILL_NOT_FOUND','Bill not found in this clinic branch.',404)
    const [[needsReview]] = await conn.query("SELECT id FROM payment_gateway_attempts WHERE billing_id=? AND status='review' AND provider_payment_id IS NOT NULL LIMIT 1",[billId])
    if (needsReview) throw http('GATEWAY_PAYMENT_NEEDS_REVIEW','A PayMongo payment for this bill is awaiting administrator review. Resolve it before generating another QR.')
    if (!['ready','partially_paid'].includes(locked.status)) throw http('BILL_NOT_READY','Confirm the bill before generating its QR.')
    const bill = await getBillingRecordWithItems(billId, conn)
    const amountCentavos = Math.round(Number(bill.balance_amount)*100)
    if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 100) throw http('INVALID_QR_AMOUNT','The remaining balance must be at least ₱1.00.')
    const [[existing]] = await conn.query('SELECT * FROM payment_gateway_attempts WHERE active_bill_id=? LIMIT 1 FOR UPDATE', [billId])
    if (existing) {
      if (String(existing.mode || 'test') !== mode) throw http('PAYMONGO_MODE_SWITCH_BLOCKED','A payment from the prior PayMongo mode still holds this bill. Resolve it using the original mode before collecting again.',409)
      await conn.commit()
      return res.json(publicAttempt(existing))
    }
    const [created] = await conn.query(`INSERT INTO payment_gateway_attempts
      (billing_id,branch_id,bill_version,amount_centavos,active_bill_id,mode,created_by_role,created_by_id)
      VALUES (?,?,?,?,?,?,?,?)`,[billId,branchId,locked.version,amountCentavos,billId,mode,req.adminContext?.account_role==='superadmin'?'superadmin':req.user.role,req.user.id])
    attempt = { id: created.insertId, amountCentavos }
    await conn.commit()
  } catch (error) { await conn.rollback().catch(()=>{}); throw error }
  finally { conn.release() }
  try {
    const qr = await createQr({amountCentavos:attempt.amountCentavos,billId,attemptId:attempt.id,
      onIntentCreated: intentId => db.query('UPDATE payment_gateway_attempts SET payment_intent_id=? WHERE id=? AND payment_intent_id IS NULL',[intentId,attempt.id]) })
    await db.query(`UPDATE payment_gateway_attempts SET status='pending',payment_intent_id=?,qr_image=?,test_url=?,expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE id=? AND status='creating'`,
      [qr.intentId,qr.qrImage,mode === 'test' && isTestSimulationUrl(qr.testUrl)?qr.testUrl:null,attempt.id])
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
  let attempt = await getLatest(billId,branchId)
  if (attempt && ACTIVE.has(attempt.status) && !attempt.provider_payment_id) {
    attempt = await reconcileAttempt(attempt.id,{force:req.query.reconcile==='1'})
      .catch(error=>{console.warn('[paymongo-reconciliation] status check failed',{attemptId:attempt.id,code:error.code});return attempt}) || attempt
  }
  res.json(attempt ? publicAttempt(attempt) : {status:'not_created',mode:configuredMode() || null,enabled:configuredMode() === 'test' || isLiveCollectionEnabled()})
}
// Release a lock only after independently retrieved, identity-matched PayMongo
// evidence that the intent is terminal AND cannot receive another payment.
const terminalNonpayable = status => ['cancelled','canceled'].includes(String(status || '').toLowerCase())
function assertMatchingIntent(attempt, intent) {
  if (intent?.id !== attempt.payment_intent_id || intent.attributes?.livemode !== expectedLive()
      || String(intent.attributes?.currency).toUpperCase() !== 'PHP'
      || Number(intent.attributes?.amount) !== Number(attempt.amount_centavos)) {
    throw http('PAYMENT_INTENT_MISMATCH','PayMongo intent does not match this QR attempt.')
  }
}
async function releaseVerifiedCancelled(attempt, intent, actor = {userId:null,userRole:'system',ipAddress:null}) {
  assertMatchingIntent(attempt, intent)
  if (!terminalNonpayable(intent.attributes?.status) || (intent.attributes?.payments || []).some(p => p?.attributes?.status === 'paid')) {
    throw http('CANCELLATION_NOT_CONFIRMED','PayMongo has not confirmed that this QR can no longer be paid.')
  }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    // Match the bill -> attempt locking order used by payBill and makeQr.
    const [[bill]] = await conn.query('SELECT id FROM billing_records WHERE id=? AND branch_id=? LIMIT 1 FOR UPDATE',[attempt.billing_id,attempt.branch_id])
    if (!bill) throw http('BILL_NOT_FOUND','Bill no longer exists in this branch.',404)
    const [[latest]] = await conn.query('SELECT * FROM payment_gateway_attempts WHERE id=? AND billing_id=? AND branch_id=? LIMIT 1 FOR UPDATE',[attempt.id,attempt.billing_id,attempt.branch_id])
    if (!latest) throw http('QR_NOT_FOUND','QR attempt no longer exists.',404)
    if (latest.status === 'succeeded' || latest.provider_payment_id) throw http('PAYMENT_ALREADY_RECORDED','This QR has a payment to reconcile, not cancel.')
    if (latest.status === 'cancelled' && !latest.active_bill_id) {await conn.commit(); return latest}
    if (!latest.active_bill_id || !ACTIVE.has(latest.status) || latest.payment_intent_id !== attempt.payment_intent_id) {
      throw http('QR_ATTEMPT_CHANGED','QR attempt changed during cancellation; reload.')
    }
    const [result] = await conn.query(`UPDATE payment_gateway_attempts SET status='cancelled',active_bill_id=NULL,qr_image=NULL,
      error_code='PROVIDER_CANCELLED_VERIFIED' WHERE id=? AND branch_id=? AND active_bill_id=?
      AND payment_intent_id=? AND provider_payment_id IS NULL AND status IN ('pending','creating','review')`,
      [attempt.id,attempt.branch_id,attempt.billing_id,attempt.payment_intent_id])
    if (Number(result.affectedRows) !== 1) throw http('QR_ATTEMPT_CHANGED','QR attempt changed during cancellation; reload.')
    await writeAuditLog({userId:actor.userId,userRole:actor.userRole,
      action:'billing.gateway_qr_cancelled',entityType:'billing_record',entityId:attempt.billing_id,
      oldValues:{attempt_id:attempt.id,status:latest.status},newValues:{attempt_id:attempt.id,provider_status:intent.attributes?.status},
      ipAddress:actor.ipAddress,branchId:attempt.branch_id}, conn)
    await conn.commit()
    return {...latest,status:'cancelled',active_bill_id:null,qr_image:null,error_code:'PROVIDER_CANCELLED_VERIFIED'}
  } catch (error) {await conn.rollback().catch(()=>{}); throw error}
  finally {conn.release()}
}
// Provider cancellation is disabled by default; TEST-mode verification and
// explicit production approval are prerequisites for enabling this endpoint.
const requestCancel = async (req,res) => {
  const billId = Number(req.params.id), attemptId = Number(req.params.attemptId), branchId = Number(req.branchId)
  if (![billId,attemptId,branchId].every(validId)) throw http('INVALID_BILL','Valid branch, bill and attempt are required.',400)
  const [[bill]] = await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=? LIMIT 1',[billId,branchId])
  if (!bill) throw http('BILL_NOT_FOUND','Bill not found in this branch.',404)
  const [[attempt]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE id=? AND billing_id=? AND branch_id=? LIMIT 1',[attemptId,billId,branchId])
  if (!attempt) throw http('QR_NOT_FOUND','QR attempt not found in this branch.',404)
  if (!sameConfiguredMode(attempt)) throw http('PAYMONGO_MODE_MISMATCH','Use the original PayMongo payment mode to resolve this attempt.')
  if (!cancellationEnabled(attempt)) throw http('QR_CANCELLATION_DISABLED','QR cancellation is not enabled. Ask an administrator to reconcile the pending attempt.',403)
  if (attempt.status === 'cancelled' && !attempt.active_bill_id) return res.json(publicAttempt(attempt))
  if (!canRequestCancel(attempt)) throw http('QR_NOT_CANCELLABLE','This attempt is not available for cashier cancellation. Reconcile it first.')
  let intent = await retrieveIntent(attempt.payment_intent_id)
  assertMatchingIntent(attempt,intent)
  if (intent.attributes?.status === 'succeeded') {
    const payment = (intent.attributes?.payments || []).find(p => p?.attributes?.status === 'paid')
    if (payment) await settleVerifiedPayment(attempt,payment)
    throw http('PAYMENT_ALREADY_SUCCEEDED','PayMongo confirms the payment succeeded. Refresh the receipt; do not collect cash.')
  }
  if (!terminalNonpayable(intent.attributes?.status)) {
    // Requests to cancel an in-flight payment are unsafe. PayMongo must
    // reject or confirm the cancellation before the cash lock is released.
    if (!['awaiting_next_action','awaiting_payment_method'].includes(String(intent.attributes?.status))) {
      throw http('QR_PROVIDER_PROCESSING','QR status is not safely cancellable; retain the payment lock for administrator review.')
    }
    await cancelIntent(attempt.payment_intent_id)
    intent = await retrieveIntent(attempt.payment_intent_id)
  }
  const result = await releaseVerifiedCancelled(attempt,intent,{
    userId:req.user.id,userRole:req.adminContext?.account_role || req.user.role,ipAddress:req.ip||null})
  return res.json(publicAttempt(result))
}
// Administrator-only resolution for a provider payment that could not be applied
// (for example the patient paid an old QR after the bill was settled in cash).
// 'apply' retries settlement when the balance now allows it; 'refunded' records
// that the refund was completed in the PayMongo dashboard. Neither moves money.
const resolveReview = async (req,res) => {
  const isAdmin = req.adminContext && ['admin','superadmin'].includes(req.adminContext.account_role)
  if (!isAdmin) throw http('ADMIN_REQUIRED','Only an administrator can resolve a reviewed PayMongo payment.',403)
  const billId = Number(req.params.id), attemptId = Number(req.params.attemptId), branchId = Number(req.branchId)
  const action = String(req.body?.action||''), note = String(req.body?.note||'').trim().slice(0,500)
  const refundId = String(req.body?.refund_id || '').trim()
  if (!validId(billId) || !validId(attemptId) || !validId(branchId)) throw http('INVALID_BILL','Invalid bill.',400)
  if (!['apply','refunded'].includes(action)) throw http('INVALID_ACTION','Choose apply or refunded.',400)
  if (action==='refunded' && (note.length < 5 || !/^ref_[a-zA-Z0-9_-]{4,115}$/.test(refundId))) throw http('REFUND_PROOF_REQUIRED','Enter the verified PayMongo refund ID (ref_...) and an explanation.',400)
  const [[attempt]] = await db.query("SELECT * FROM payment_gateway_attempts WHERE id=? AND billing_id=? AND branch_id=? AND status='review' AND provider_payment_id IS NOT NULL LIMIT 1",[attemptId,billId,branchId])
  if (!attempt) throw http('REVIEW_NOT_FOUND','No PayMongo payment awaiting review for this bill.',404)
  if (!sameConfiguredMode(attempt)) throw http('PAYMONGO_MODE_MISMATCH','Resolve this payment under its original PayMongo mode.',409)
  let result
  if (action==='apply') {
    const intent = await retrieveIntent(attempt.payment_intent_id)
    const payment = (intent.attributes?.payments||[]).find(p=>p?.id===attempt.provider_payment_id)
    if (intent.attributes?.status!=='succeeded' || !payment) throw http('PAYMENT_NOT_CONFIRMED','The PayMongo intent is not confirmed as paid.',409)
    result = await settleVerifiedPayment({...attempt,status:'pending'},payment,{fromReview:true})
    if (result.review) throw http('PAYMENT_STILL_NOT_APPLICABLE','The payment still cannot be applied to this bill. Refund it in PayMongo, then mark it refunded.',409)
  } else {
    // This is a provider-status CHECK, never an API refund request. The refund
    // must already have succeeded in PayMongo before local reconciliation.
    assertVerifiedQrRefund(await retrieveRefund(refundId), attempt)
    const [updated] = await db.query("UPDATE payment_gateway_attempts SET status='refunded',active_bill_id=NULL,error_code='REFUNDED_VERIFIED' WHERE id=? AND branch_id=? AND status='review' AND provider_payment_id=?",[attempt.id,branchId,attempt.provider_payment_id])
    if (updated.affectedRows !== 1) throw http('REVIEW_CHANGED','The reviewed payment has changed; reload before trying again.',409)
    result = {resolved:'refunded',provider_refund_id:refundId}
  }
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext.account_role,action:`billing.gateway_review_${action}`,entityType:'billing_record',entityId:billId,
    oldValues:{attempt_id:attempt.id,error_code:attempt.error_code},newValues:{provider_payment_id:attempt.provider_payment_id,provider_refund_id:action==='refunded'?refundId:null,note},ipAddress:req.ip||null,branchId}).catch(()=>{})
  res.json({...result,attempt:publicAttempt((await db.query('SELECT * FROM payment_gateway_attempts WHERE id=?',[attempt.id]))[0][0])})
}
apiRouter.post('/:id/qr-payment', (req,res,next)=>Promise.resolve(makeQr(req,res)).catch(next))
apiRouter.get('/:id/qr-payment/status', (req,res,next)=>Promise.resolve(status(req,res)).catch(next))
apiRouter.post('/:id/qr-payment/:attemptId/cancel', (req,res,next)=>Promise.resolve(requestCancel(req,res)).catch(next))
apiRouter.post('/:id/qr-payment/:attemptId/resolve', (req,res,next)=>Promise.resolve(resolveReview(req,res)).catch(next))

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
      reference_number:payId, idempotency_key:`paymongo:${payId}`, payment_notes:`Verified PayMongo QR Ph ${attempt.mode === 'live' ? 'live' : 'test'} payment` },
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
  if (!/^evt_[a-zA-Z0-9_-]{4,115}$/.test(eid) || attrs?.livemode !== expectedLive()) throw http('INVALID_PAYMONGO_EVENT','Invalid event for the configured PayMongo mode.',400)
  if (!['payment.paid','payment.failed','qrph.expired'].includes(type)) return {ignored:true}
  const payment = attrs.data
  const paymentAttrs = payment?.attributes || {}
  const intentId = String(paymentAttrs.payment_intent_id || '')
  if (!intentId) return {ignored:true}
  const [[attempt]] = await db.query('SELECT * FROM payment_gateway_attempts WHERE payment_intent_id=? LIMIT 1',[intentId])
  if (!attempt) return {ignored:true}
  if (!sameConfiguredMode(attempt)) throw http('PAYMONGO_MODE_MISMATCH','Payment attempt belongs to a different PayMongo environment.',409)
  await db.query(`INSERT IGNORE INTO payment_gateway_webhook_events (event_id,attempt_id,event_type) VALUES (?,?,?)`,[eid,attempt.id,type])
  const [[savedEvent]] = await db.query('SELECT status FROM payment_gateway_webhook_events WHERE event_id=?',[eid])
  if (savedEvent?.status === 'processed') return {duplicate:true}
  if (type !== 'payment.paid') {
    // Failure/expiry must not override a succeeded payment. A failed method can
    // have another attempt pending; do not assume the whole intent is terminal.
    if (type === 'qrph.expired') {
      // A signed expiry event does not by itself prove that the intent cannot
      // settle; keep the lock until an independent terminal-status check.
      await reconcileAttempt(attempt.id,{force:true})
    }
    await db.query("UPDATE payment_gateway_webhook_events SET status='processed',processed_at=NOW() WHERE event_id=?",[eid])
    return {processed:true}
  }
  if (paymentAttrs.livemode !== expectedLive() || paymentAttrs.status !== 'paid'
      || String(paymentAttrs.currency).toUpperCase() !== 'PHP'
      || String(paymentAttrs.source?.type || '').toLowerCase() !== 'qrph'
      || Number(paymentAttrs.amount) !== Number(attempt.amount_centavos)
      || !String(payment.id || '').startsWith('pay_')) throw http('PAYMENT_AMOUNT_MISMATCH','Provider payment details do not match the original QR amount.')
  // Do not trust a signed fixture/event alone; independently retrieve the intent.
  const intent = await retrieveIntent(intentId)
  if (intent.id !== intentId || intent.attributes?.livemode !== expectedLive() || intent.attributes?.status !== 'succeeded'
      || Number(intent.attributes?.amount) !== Number(attempt.amount_centavos)
      || String(intent.attributes?.currency).toUpperCase() !== 'PHP') throw http('PAYMENT_NOT_CONFIRMED','The PayMongo intent is not confirmed as paid.',409)
  const outcome = await settleVerifiedPayment(attempt,payment)
  if (outcome.review) await db.query("UPDATE payment_gateway_webhook_events SET error_code=? WHERE event_id=?",[outcome.error_code,eid])
  await db.query("UPDATE payment_gateway_webhook_events SET status='processed',processed_at=NOW() WHERE event_id=?",[eid])
  return outcome.review ? {processed:true,review:true} : {processed:true}
}
// Shared by the webhook, status-poll reconciliation and the background sweeper.
// The caller has already verified the PayMongo intent is succeeded for this amount.
async function settleVerifiedPayment(attempt,payment) {
  const a = payment?.attributes || {}
  if (!sameConfiguredMode(attempt) || a.livemode !== expectedLive() || a.status !== 'paid' || String(a.currency).toUpperCase() !== 'PHP'
      || String(a.source?.type || '').toLowerCase() !== 'qrph' || Number(a.amount) !== Number(attempt.amount_centavos)
      || !String(payment.id || '').startsWith('pay_')) throw http('PAYMENT_AMOUNT_MISMATCH','Provider payment details do not match the original QR amount.')
  let receiptId
  if (attempt.status === 'succeeded') {
    const [[old]] = await db.query('SELECT id FROM billing_payments WHERE billing_id=? AND idempotency_key=? LIMIT 1',[attempt.billing_id,`paymongo:${payment.id}`])
    if (!old) throw http('PAYMENT_RECONCILIATION_REQUIRED','Missing receipt for previously settled gateway attempt.')
    receiptId = old.id
  } else {
    try { receiptId = await settleThroughExistingCheckout(attempt,payment) }
    catch (error) {
      if (error.code !== 'PAYMENT_RECONCILIATION_REQUIRED') throw error // database/transient: let PayMongo retry
      // A concurrent delivery (webhook retry, status poll or sweeper) may have just
      // recorded this exact provider payment on this bill; that is settled, not a review case.
      const [[settled]] = await db.query('SELECT id FROM billing_payments WHERE billing_id=? AND idempotency_key=? AND status=? LIMIT 1',[attempt.billing_id,`paymongo:${payment.id}`,'completed'])
      if (!settled) return markPaidForReview(attempt,payment,error)
      receiptId = settled.id
    }
  }
  await db.query(`UPDATE payment_gateway_attempts SET status='succeeded',active_bill_id=NULL,
    qr_image=NULL,provider_payment_id=?,settled_payment_id=?,error_code=NULL WHERE id=? AND (provider_payment_id IS NULL OR provider_payment_id=?)`,[payment.id,receiptId,attempt.id,payment.id])
  broadcast(['admin','staff'],'billing_paid',{billingId:attempt.billing_id,provider:'paymongo'},{branchId:attempt.branch_id})
  return {processed:true,receiptId}
}
// The patient's money was confirmed by PayMongo but the bill can no longer accept
// it. Keep the provider payment durably (so it is never lost) and stop retries.
async function markPaidForReview(attempt,payment,cause) {
  const [[bill]] = await db.query('SELECT status FROM billing_records WHERE id=?',[attempt.billing_id])
  const errorCode = ['paid','voided','refunded'].includes(bill?.status) ? 'PAID_AFTER_SETTLEMENT' : 'PAID_NOT_APPLIED'
  await db.query("UPDATE payment_gateway_attempts SET status='review',provider_payment_id=?,error_code=? WHERE id=? AND status<>'succeeded'",[payment.id,errorCode,attempt.id])
  await writeAuditLog({userId:null,userRole:'system',action:'billing.gateway_payment_needs_review',entityType:'billing_record',entityId:attempt.billing_id,
    oldValues:{bill_status:bill?.status||null},newValues:{attempt_id:attempt.id,provider_payment_id:payment.id,amount:Number(attempt.amount_centavos)/100,error_code:errorCode,reason:String(cause?.message||'').slice(0,200)},
    ipAddress:null,branchId:attempt.branch_id}).catch(()=>{})
  console.error('[paymongo-reconciliation] provider payment needs review',{attemptId:attempt.id,billingId:attempt.billing_id,errorCode})
  broadcast(['admin','staff'],'billing_gateway_review',{billingId:attempt.billing_id,errorCode},{branchId:attempt.branch_id})
  return {review:true,error_code:errorCode}
}
const ACTIVE = new Set(['pending','creating','review'])
const lastChecked = new Map()
// Bring one local attempt in line with PayMongo. Never marks anything paid
// without a provider-confirmed succeeded intent and a matching paid payment.
async function reconcileAttempt(attemptId,{force=false}={}) {
  const load = async () => (await db.query(`SELECT a.*, TIMESTAMPDIFF(SECOND,a.created_at,NOW()) AS age_seconds,
    (a.expires_at IS NOT NULL AND a.expires_at < NOW()) AS is_expired FROM payment_gateway_attempts a WHERE a.id=?`,[attemptId]))[0][0]
  const attempt = await load()
  if (!attempt || !ACTIVE.has(attempt.status) || attempt.provider_payment_id || !sameConfiguredMode(attempt)) return attempt
  const now = Date.now()
  if (now - (lastChecked.get(attempt.id)||0) < (force ? 2000 : 15000)) return attempt
  lastChecked.set(attempt.id,now)
  if (attempt.payment_intent_id) {
    const intent = await retrieveIntent(attempt.payment_intent_id)
    assertMatchingIntent(attempt,intent)
    const providerStatus = intent.attributes?.status
    if (providerStatus === 'succeeded') {
      const payment = (intent.attributes?.payments||[]).find(p=>p?.attributes?.status==='paid')
      if (payment) await settleVerifiedPayment(attempt,payment)
      return load()
    }
    if (terminalNonpayable(providerStatus)) await releaseVerifiedCancelled(attempt,intent)
  }
  // Never infer payment terminality from a 30-minute local timer, an absent
  // provider ID, or an unrecognized/nonterminal provider status.
  return load()
}
// Recovers payments whose webhook never arrived (ngrok outage, browser closed).
let sweeper = null
function startReconciliationSweeper(intervalMs = 60000) {
  if (sweeper || !supportsMode(configuredMode())) return sweeper
  sweeper = setInterval(async () => {
    try {
      const [rows] = await db.query(`SELECT id FROM payment_gateway_attempts WHERE status IN ('pending','creating','review')
        AND mode=? AND provider_payment_id IS NULL AND created_at < NOW() - INTERVAL 2 MINUTE ORDER BY id LIMIT 25`,[configuredMode()])
      for (const row of rows) await reconcileAttempt(row.id).catch(error=>console.warn('[paymongo-reconciliation] sweep',{attemptId:row.id,code:error.code}))
    } catch (error) { console.warn('[paymongo-reconciliation] sweep failed',{code:error.code}) }
  }, intervalMs)
  sweeper.unref?.()
  return sweeper
}
const rawWebhook = async (req,res) => {
  try { credentials() } catch { return res.status(503).json({code:'PAYMONGO_DISABLED'}) }
  if (!verifyPaymongoSignature(req.body,req.get('paymongo-signature'),process.env.PAYMONGO_WEBHOOK_SECRET,Date.now()/1000,configuredMode())) return res.status(401).json({code:'INVALID_WEBHOOK_SIGNATURE'})
  let event
  try { event=JSON.parse(req.body.toString('utf8')) }
  catch {return res.status(400).json({code:'INVALID_JSON'})}
  try {return res.json(await handleWebhookEvent(event))}
  catch (error) {
    console.error('[paymongo-reconciliation]',{code:error.code,message:error.message,eventId:event?.data?.id})
    return res.status(error.statusCode || 503).json({code:error.code||'RETRY_LATER'})
  }
}
module.exports = { apiRouter, rawWebhook, handleWebhookEvent, publicAttempt, isTestSimulationUrl, reconcileAttempt, startReconciliationSweeper, requestCancel, terminalNonpayable }
