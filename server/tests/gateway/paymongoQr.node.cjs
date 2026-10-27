'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const read = f => fs.readFileSync(path.resolve(__dirname,'../..',f),'utf8')
const {verifyPaymongoSignature}=require('../../utils/paymongoWebhookSignature')
const body=Buffer.from('{"data":{"id":"evt_1234567"}}')
const stamp=1720000000
const secret='whsk_TEST'
const mac=crypto.createHmac('sha256',secret).update(`${stamp}.`).update(body).digest('hex')
test('PayMongo test and live signatures validate only the correct signed field',()=>{
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=${mac},li=`,secret,stamp),true)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=${mac},li=`,secret,stamp+301),false)
 assert.equal(verifyPaymongoSignature(Buffer.from('changed'),`t=${stamp},te=${mac},li=`,secret,stamp),false)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=invalid,li=`,secret,stamp),false)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=${mac},li=`, 'wrong_secret',stamp),false)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=,li=${mac}`,secret,stamp,'live'),true)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=${mac},li=`,secret,stamp,'live'),false)
 assert.equal(verifyPaymongoSignature(body,`t=${stamp},te=,li=${mac}`,secret,stamp,'test'),false)
 assert.equal(verifyPaymongoSignature(Buffer.from('changed'),`t=${stamp},te=,li=${mac}`,secret,stamp,'live'),false)
})
test('PayMongo credentials enforce matching keys for TEST and LIVE',()=>{
 const filename=path.resolve(__dirname,'../../utils/paymongoClient.js')
 const prior={mode:process.env.PAYMONGO_MODE,secret:process.env.PAYMONGO_SECRET_KEY,public:process.env.PAYMONGO_PUBLIC_KEY}
 const client=require(filename)
 try {
  process.env.PAYMONGO_MODE='test';process.env.PAYMONGO_SECRET_KEY='sk_live_never';process.env.PAYMONGO_PUBLIC_KEY='pk_test_x'
  assert.throws(()=>client.credentials(),/matching PayMongo TEST credentials/)
  process.env.PAYMONGO_SECRET_KEY='sk_test_a';process.env.PAYMONGO_PUBLIC_KEY='pk_test_a'
  assert.deepEqual(client.credentials(),{secret:'sk_test_a',publicKey:'pk_test_a',mode:'test'})
  process.env.PAYMONGO_MODE='live';assert.throws(()=>client.credentials(),/matching PayMongo LIVE credentials/)
  process.env.PAYMONGO_SECRET_KEY='sk_live_a';process.env.PAYMONGO_PUBLIC_KEY='pk_live_a'
  assert.deepEqual(client.credentials(),{secret:'sk_live_a',publicKey:'pk_live_a',mode:'live'})
 } finally {
  for(const [key,value] of Object.entries({PAYMONGO_MODE:prior.mode,PAYMONGO_SECRET_KEY:prior.secret,PAYMONGO_PUBLIC_KEY:prior.public})){
   if(value===undefined)delete process.env[key];else process.env[key]=value
  }
 }
})
test('QR Ph only generated for confirmed branch-owned bills; webhooks cannot trust bare UI success',()=>{
 const router=read('routers/paymongoGateway.js'),staff=read('controllers/staff.controller.js')
 assert.match(router,/WHERE id=\? AND branch_id=\? LIMIT 1 FOR UPDATE/)
 assert.match(router,/\['ready','partially_paid'\]/)
 assert.match(router,/amount_centavos/)
 assert.match(router,/paymentAttrs\.livemode !== expectedLive\(\)/)
 assert.match(router,/sameConfiguredMode\(attempt\)/)
 assert.match(router,/await retrieveIntent\(intentId\)/)
 assert.match(router,/intent\.attributes\?\.status !== 'succeeded'/)
 assert.match(router,/await staffCtrl\.payBill\(req,res\)/)
 assert.match(staff,/gatewayVerified = req.gatewayVerified/)
 assert.match(staff,/QR_PAYMENT_PENDING/)
 assert.match(read('db/migrations/2026-10-16-paymongo-test-qr.sql'),/UNIQUE KEY uq_paymongo_active_bill/)
})
test('every inventory log INSERT contains the physical branch',()=>{
 const files=['controllers/admin.controller.js','controllers/staff.controller.js','controllers/doctor.controller.js',
  'controllers/billingCorrections.controller.js','utils/supplyTransfers.js','utils/manualInventoryMovement.js','routers/branchInventoryItems.js']
 for(const file of files){
  const source=read(file)
  for(const match of source.matchAll(/INSERT\s+INTO\s+inventory_logs\s*\(([^)]+)\)/gi)){
   assert.match(match[1],/\bbranch_id\b/i,`${file} has unscoped stock log SQL`)
  }
 }
})
test('Doctor and billing helpers enforce branch-owned catalog items and bill attribution',()=>{
 const source=read('utils/billing.js')
 assert.match(source,/appointment\?\.branch_id/)
 assert.match(source,/\(appointment_id, consultation_id, patient_id, doctor_id, branch_id, status/)
 assert.match(source,/normalizeBillingItems\(consultationItems, executor, branchId\)/)
 assert.match(source,/SERVICE_NOT_FOUND/)
 assert.match(source,/INVENTORY_NOT_FOUND/)
 assert.match(read('controllers/doctor.controller.js'),/enforceFixedCatalogConsumables\(payload\.billableServices, conn, req\.branchId\)/)
})
test('production origin protection covers Super Admin cookies',()=>{
 assert.match(read('middlewares/httpSecurity.middleware.js'),/superadmin_token/)
})

test('webhook settlement preserves the original human bill confirmer',()=>{
 const source=read('controllers/staff.controller.js')
 assert.match(source,/gatewayVerified \? 1 : 0, isAdminActor/)
 assert.match(source,/confirmed_by_staff_id = CASE WHEN \? = 1 THEN confirmed_by_staff_id/)
 assert.match(source,/WHERE id = \? AND branch_id = \?/ )
 assert.match(source,/userRole: gatewayVerified \? 'system' : actorRole/)
})

test('QR settlement reuses the bill-locked payment transaction for receipt and inventory idempotency',()=>{
 const staff=read('controllers/staff.controller.js')
 const migration=read('db/migrations/2026-08-27-security-hardening-batches-07-12.sql')
 assert.match(staff,/WHERE bp\.idempotency_key = \? LIMIT 1/)
 assert.match(staff,/WHERE id = \? AND branch_id = \? LIMIT 1 FOR UPDATE/)
 assert.match(staff,/allocateReceiptNumber\(conn, lockedBill\.branch_id\)/)
 assert.match(staff,/dispenseCheckoutSupplies\([\s\S]*?executor: conn/)
 assert.match(staff,/INSERT INTO billing_payments[\s\S]*?idempotency_key/)
 assert.match(staff,/await conn\.commit\(\)/)
 assert.match(staff,/await conn\.rollback\(\)/)
 assert.match(migration,/CREATE UNIQUE INDEX uniq_billing_payment_idempotency ON billing_payments \(idempotency_key\)/)
})

test('Staff and branch-admin QR routes require authorization and derive ownership from branch-scoped context',()=>{
 const staffRouter=read('routers/staff.router.js')
 const branchRouter=read('routers/branches.router.js')
 const gateway=read('routers/paymongoGateway.js')
 assert.match(staffRouter,/router\.use\('\/billing', \.\.\.auth, can\('checkout'\), require\('\.\/paymongoGateway'\)\.apiRouter\)/)
 assert.match(branchRouter,/router\.use\(`\$\{prefix\}\/billing`,\.\.\.middle,requirePermission\('billing'\),require\('\.\/paymongoGateway'\)\.apiRouter\)/)
 assert.match(gateway,/WHERE id=\? AND branch_id=\? LIMIT 1 FOR UPDATE/)
 assert.match(gateway,/WHERE a\.active_bill_id=\? AND b\.branch_id=\?/)
})


test('LIVE QR creation stays disabled until explicitly activated', async()=>{
 const client=require('../../utils/paymongoClient')
 const old={...process.env}
 try {
  Object.assign(process.env,{PAYMONGO_MODE:'live',PAYMONGO_SECRET_KEY:'sk_live_example',PAYMONGO_PUBLIC_KEY:'pk_live_example',PAYMONGO_LIVE_ENABLED:'false'})
  await assert.rejects(client.createQr({amountCentavos:2000,billId:1,attemptId:123}), e=>e.code==='PAYMONGO_LIVE_NOT_ENABLED')
 } finally {process.env=old}
})
