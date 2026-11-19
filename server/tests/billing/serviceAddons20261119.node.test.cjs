const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {fixture}=require('../helpers/serviceAddonsFixture.cjs')
const clone=x=>structuredClone(x)
test('PHP 1,000 paid visit → past certificate → PHP 100 pending add-on → its own receipt; original stays unchanged',async()=>{
 const h=fixture()
 assert.equal((await h.pay(1,1000,'original-payment')).statusCode,200)
 const original=await h.readBill(1)
 const issued=await h.call(h.certificates.issue,h.certReq)
 assert.equal(issued.statusCode,200);assert.equal(issued.body.certificate.consultation_date,'2026-11-01')
 assert.notEqual(issued.body.certificate.issuance_date,'2026-11-01')
 assert.equal(h.state.charges.length,0,'Issuance has no billing side effects')
 const created=await h.charge()
 assert.equal(created.statusCode,200);assert.equal(created.body.price_snapshot,100)
 const addon=await h.readBill(created.body.billing_id)
 assert.equal(addon.status,'ready');assert.equal(addon.original_bill_id,1);assert.equal(addon.consultation_id,20)
 const {PENDING_BILL_STATUSES}=await import('../../../client/src/components/billing/billingWorkspaceModel.mjs')
 assert.ok(PENDING_BILL_STATUSES.split(',').includes(addon.status));assert.equal(addon.balance_amount,100)
 assert.equal((await h.pay(addon.id,100,'addon-payment')).statusCode,200)
 assert.deepEqual(await h.readBill(1),original)
 const paidAddon=await h.readBill(addon.id)
 assert.equal(paidAddon.payments.length,1);assert.equal(paidAddon.payments[0].amount,100)
 assert.notEqual(paidAddon.payments[0].receipt_number,original.payments[0].receipt_number)
 assert.equal(h.state.receipts,2)
 const retried=await h.pay(addon.id,100,'addon-payment');assert.equal(retried.statusCode,200);assert.equal(h.state.receipts,2)
 const repeatIssue=await h.call(h.certificates.issue,h.certReq);assert.equal(repeatIssue.body.certificate.id,issued.body.certificate.id);assert.equal(h.state.certificates.length,1);assert.equal(h.state.receipts,2)
})
test('editable bill appends a separate saved-price line and no extra bill or payment',async()=>{
 const h=fixture({status:'draft'}),r=await h.charge()
 assert.equal(r.statusCode,200);assert.equal(r.body.billing_id,1);assert.equal(h.state.bills.length,1)
 assert.equal(h.state.bills[0].total_amount,1100);assert.equal(h.state.bills[0].version,2)
 assert.equal(h.state.items[1].source_type,'service_addon');assert.equal(h.state.items[1].unit_price,100)
 assert.equal(h.state.receipts,0)
 h.state.addons[0].default_price=250
 await h.charge({request_key:'after-reload',expected_price:250})
 assert.equal(h.state.items[1].unit_price,100);assert.equal(h.state.charges.length,1)
})
test('legacy draft status never permits rewriting a bill that already has a receipt or was finalized',async()=>{
 for(const prior of ['receipt','finalized']){
  const h=fixture({status:'draft'})
  if(prior==='receipt')h.state.payments.push({id:1,billing_id:1,amount:1000,status:'completed',receipt_number:'OR-OLD'})
  else h.state.bills[0].finalized_at='2026-11-01'
  const original=await h.readBill(1),r=await h.charge()
  assert.equal(r.statusCode,200);assert.equal(r.body.billing_id,2);assert.deepEqual(await h.readBill(1),original)
 }
})
test('per-service override of 75 beats default 100; later price changes apply only to future charges',async()=>{
 const h=fixture({override:75});await h.charge();assert.equal(h.state.items[1].unit_price,75)
 h.state.attached[0].price_override=90
 const retry=await h.charge({expected_price:90,request_key:'reload'});assert.equal(retry.body.price_snapshot,75)
 assert.equal(h.state.bills[1].total_amount,75)
})
for(const override of [0,null])test(`free add-on (${override===0?'zero override':'zero default'}) produces no collection or receipt`,async()=>{
 const h=fixture({override,price:override===0?100:0});await h.pay(1,1000,'original')
 const original=clone(h.state.payments),r=await h.charge()
 assert.equal(r.statusCode,200);assert.equal(r.body.price_snapshot,0);assert.equal(h.state.bills[1].status,'paid')
 assert.equal((await h.pay(2,0,'must-not-charge')).statusCode,409)
 assert.deepEqual(h.state.payments,original);assert.equal(h.state.receipts,1)
})
test('concurrent retries and a new submission key after reload still create one add-on transaction',async()=>{
 const h=fixture();const results=await Promise.all([h.charge(),h.charge(),h.charge({request_key:'new-key'})])
 assert.ok(results.every(r=>r.statusCode===200));assert.equal(h.state.charges.length,1);assert.equal(h.state.bills.length,2);assert.equal(h.state.items.length,2)
})
test('stale price, forged service, inactive add-on and wrong branch cannot charge',async()=>{
 for(const body of [{expected_price:99},{service_id:999}]){const h=fixture();const r=await h.charge(body);assert.ok([404,409].includes(r.statusCode));assert.equal(h.state.charges.length,0)}
 const h=fixture();h.state.addons[0].is_active=0;assert.equal((await h.charge()).statusCode,404)
 const r=await h.call(h.addons.confirm,{params:{id:1},branchId:3,user:{id:9},body:{}});assert.equal(r.statusCode,404);assert.equal(h.state.charges.length,0)
})
test('certificate access is constrained to the owning doctor and branch; issuing while active needs no paid bill',async()=>{
 const h=fixture({status:'draft'})
 for(const change of [{branchId:3},{user:{id:41,role:'doctor'}}]){const r=await h.call(h.certificates.get,{...h.certReq,...change});assert.equal(r.statusCode,404)}
 const issued=await h.call(h.certificates.issue,h.certReq)
 assert.equal(issued.statusCode,200);assert.equal(h.state.payments.length,0);assert.equal(h.state.charges.length,0)
 const get=await h.call(h.certificates.get,h.certReq);assert.equal(get.body.certificate.doctor_name,'Dr. Test')
 assert.equal(get.body.certificate.prc_license,'123456');assert.equal(get.body.certificate.patient_name,'José Test')
})
test('service configuration preserves null default and explicit zero overrides, rejects cross-branch attachment',async()=>{
 const h=fixture(),conn=await h.db.getConnection()
 await h.addons.saveServiceAddons(conn,2,5,[{addon_id:6,price_override:0}]);assert.equal(h.state.attached[0].price_override,0)
 await h.addons.saveServiceAddons(conn,2,5,[{addon_id:6,price_override:null}]);assert.equal(h.state.attached[0].price_override,null)
 await assert.rejects(h.addons.saveServiceAddons(conn,3,5,[{addon_id:6}]),{statusCode:404})
 for(const value of ['',null,-1,100.123,Infinity,{},true])assert.throws(()=>h.addons.money(value))
 assert.equal(h.addons.money('0.00'),0)
})
test('add-on schema rekeys are resumable and retain unique original visits',async()=>{
 const {serviceAddonsSchemaFixture}=require('../helpers/serviceAddonsSchemaFixture.cjs'),schema=serviceAddonsSchemaFixture()
 const {splitMysqlMigration}=require('../../scripts/branchMigrations'),{runServiceAddonsMigration}=require('../../scripts/serviceAddonsMigration')
 const statements=splitMysqlMigration(fs.readFileSync(path.resolve(__dirname,'../../db/migrations/2026-11-19-service-addons-certificates.sql'),'utf8'))
 const conn={query:async(sql,p)=>schema.query(sql,p)||[[]]}
 await runServiceAddonsMigration(conn,statements.slice(0,4));await runServiceAddonsMigration(conn,statements)
 assert.deepEqual(schema.indexes.get('uniq_bill_visit_charge'),['appointment_id','charge_key']);assert.equal(schema.indexes.has('uniq_billing_records_appointment'),false)
 await runServiceAddonsMigration(conn,statements)
})

test('wrong roles and billing-only Staff are denied by existing permission middleware',async()=>{
 const express=require('express'),request=require('supertest'),role=require('../../middlewares/role.middleware')
 const {requireStaffPermission}=require('../../middlewares/staffPermission.middleware'),h=fixture(),app=express()
 app.use(express.json(),(req,res,next)=>{req.user={id:9,role:req.headers['x-test-role']};req.branchId=2;req.staffPermissions=String(req.headers['x-test-permissions']||'').split(',');next()})
 app.post('/billing/:id/addons',role('staff'),requireStaffPermission('checkout'),h.addons.confirm)
 app.get('/consultations/:appointmentId/medical-certificate',role('doctor'),h.certificates.get)
 for(const actor of ['patient','doctor','admin'])assert.equal((await request(app).post('/billing/1/addons').set('x-test-role',actor).set('x-test-permissions','checkout').send({})).status,403)
 assert.equal((await request(app).post('/billing/1/addons').set('x-test-role','staff').set('x-test-permissions','billing').send({})).status,403)
 for(const actor of ['staff','patient','admin'])assert.equal((await request(app).get('/consultations/10/medical-certificate').set('x-test-role',actor)).status,403)
 assert.equal(h.state.charges.length,0);assert.equal(h.state.certificates.length,0)
})

test('separate receipt HTML contains only its own bill lines and payment',async()=>{
 const h=fixture();await h.pay(1,1000,'original');await h.charge();await h.pay(2,100,'addon')
 const {buildBillingReceiptHtml}=await import('../../../client/src/utils/billingReceiptTemplate.mjs')
 const original=await h.readBill(1),addon=await h.readBill(2)
 const first=buildBillingReceiptHtml({bill:original,payment:original.payments[0]}),second=buildBillingReceiptHtml({bill:addon,payment:addon.payments[0]})
 assert.match(first,/1,000\.00/);assert.doesNotMatch(first,/Medical Certificate/)
 assert.match(second,/Medical Certificate/);assert.match(second,/100\.00/);assert.doesNotMatch(second,/1,000\.00/)
 assert.ok(first.includes(original.payments[0].receipt_number));assert.ok(!second.includes(original.payments[0].receipt_number))
})

test('certificate PDF has valid binary offsets for multiple pages and preserves clinical Unicode input',async()=>{
 const {jpegPagesToPdf,certificateParagraphs}=await import('../../../client/src/utils/medicalCertificatePdf.mjs')
 const blob=jpegPagesToPdf([{width:1,height:1,bytes:Uint8Array.of(255,216,255,217)},{width:1,height:1,bytes:Uint8Array.of(255,216,255,217)}]),bytes=Buffer.from(await blob.arrayBuffer()),text=bytes.toString('latin1')
 assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 2/)
 assert.match(text,/\/MediaBox \[0 0 612 792\]/)
 const xref=Number(/startxref\n(\d+)/.exec(text)[1]);assert.equal(bytes.subarray(xref,xref+4).toString(),'xref')
 for(const [,offset] of text.matchAll(/(\d{10}) 00000 n/g))assert.match(bytes.subarray(Number(offset),Number(offset)+12).toString(),/^\d+ 0 obj/)
 assert.ok(certificateParagraphs({patient_name:'José 李',diagnosis:'Diagnóstico — café',recommendation:'Reposo'}).some(([t])=>String(t).includes('José 李')))
})

test('template uses the patient age at the visit and the actual visit/issuing doctor instead of sample document identities',async()=>{
 const {certificateContent,certificateParagraphs}=await import('../../../client/src/utils/medicalCertificatePdf.mjs')
 const certificate={patient_name:'Synthetic Patient',birthdate:'1990-11-02',sex:'female',consultation_date:'2026-11-01',issuance_date:'2026-11-19',branch_name:'Selected Branch',doctor_name:'Dr. Issuer',prc_license:'555555',specialty:'Dermatology',diagnosis:'Recorded diagnosis',recommendation:'Recorded advice',remarks:'Recorded remarks'}
 const content=certificateContent(certificate),text=certificateParagraphs(certificate).map(([value])=>value).join('\n')
 assert.equal(content.age,35);assert.equal(content.patient,'Synthetic Patient 35/F')
 assert.match(content.introduction,/November 1, 2026 at Selected Branch/)
 assert.match(text,/Consultation Date: 2026-11-01/);assert.match(text,/Date Issued: 2026-11-19/)
 assert.match(text,/Dr\. Issuer/);assert.match(text,/License No\. 555555/)
 assert.match(text,/PTR No\. __________________/)
 assert.doesNotMatch(text,/118849|0061969|Frisha|Viral Influenza|online platform/)
 assert.equal(certificateContent({...certificate,birthdate:null}).age,null)
 assert.equal(certificateContent({...certificate,birthdate:'2026-02-30'}).age,null)
 assert.equal(certificateContent({...certificate,birthdate:'2026-11-01'}).age,0)
})
