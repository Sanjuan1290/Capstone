'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),out=__dirname
if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_PORT!=='33409'||process.env.DB_NAME!=='carait_qa_20261111')throw Error('API audit requires the isolated synthetic database')
const {app}=require('../../server/server'),db=require('../../server/db/connect')
const bcrypt=require('../../server/node_modules/bcrypt'),jwt=require('../../server/node_modules/jsonwebtoken')
const {makeSessionToken}=require('../../server/utils/sessionSecurity')
const tuples=[
 ['/api/patient',require('../../server/routers/patient.router')],
 ['/api/admin',require('../../server/routers/admin.router')],
 ['/api/staff',require('../../server/routers/staff.router')],
 ['/api/doctor',require('../../server/routers/doctor.router')],
 ['/api/branches',require('../../server/routers/branches.router').router],
 ['/api/auth',require('../../server/routers/auth.router')],
 ['/api/superadmin/patients',require('../../server/routers/superadminPatients.router')],
 ['/api/queue',require('../../server/routers/queue.router')],
 ['/api/news',require('../../server/routers/branchAnnouncements').publicRouter],
]
const endpoints=[]
for(const [prefix,router] of tuples)for(const layer of router.stack)if(layer.route)for(const method of Object.keys(layer.route.methods))endpoints.push({method:method.toUpperCase(),path:prefix+(layer.route.path==='/'?'':layer.route.path),handlers:layer.route.stack.map(s=>s.handle.name||'<anonymous>'),anonymous:'NOT TESTED',expired:'NOT TESTED'})
// Expand the only nested routers, after verifying the real mounted instances.
const gateway=require('../../server/routers/paymongoGateway').apiRouter
for(const [prefix,parent] of [['/api/staff/billing',require('../../server/routers/staff.router')],['/api/branches/my/legacy/billing',require('../../server/routers/branches.router').router],['/api/branches/workspace/:branchId/legacy/billing',require('../../server/routers/branches.router').router]]){
 assert.ok(parent.stack.some(layer=>layer.handle===gateway||layer.handle.stack===gateway.stack),'Gateway must be a runtime-mounted router')
 for(const layer of gateway.stack)if(layer.route)for(const method of Object.keys(layer.route.methods))endpoints.push({method:method.toUpperCase(),path:prefix+layer.route.path,handlers:layer.route.stack.map(s=>s.handle.name||'<anonymous>'),anonymous:'NOT TESTED',expired:'NOT TESTED'})
}
for(const layer of app._router.stack)if(layer.route)for(const method of Object.keys(layer.route.methods))endpoints.push({method:method.toUpperCase(),path:layer.route.path,handlers:layer.route.stack.map(s=>s.handle.name||'<anonymous>'),anonymous:'NOT TESTED',expired:'NOT TESTED'})
const results=[],sqlResults=[],executions=[]
let activeCheck=''
let server,base
const tokens={}
const id=value=>{if(!/^[a-z_]+$/.test(value))throw Error('Invalid synthetic fixture identifier');return '`'+value+'`'}
const insert=async(table,values)=>{const keys=Object.keys(values);const [row]=await db.query(`INSERT INTO ${id(table)} (${keys.map(id).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(values));return row.insertId}
async function check(name,fn){activeCheck=name;try{await fn();results.push({name,status:'PASS'})}catch(error){results.push({name,status:'FAIL',reason:error.message.slice(0,900)});console.log('FAIL '+name+': '+error.message.slice(0,250))}finally{activeCheck=''}}
async function request(method,url,role,body){
 const response=await fetch(base+url,{method,redirect:'manual',headers:{...(role?{Cookie:tokens[role]}:{}),...(role==='superadmin'?{'X-Admin-Portal':'superadmin'}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)})
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text.slice(0,120)}
 executions.push({case:activeCheck||'Endpoint authentication matrix',method,path:url.split('?')[0],role:role||'anonymous',status:response.status})
 return {status:response.status,data,headers:response.headers}
}
async function seed(){
 const password=await bcrypt.hash('SyntheticQa!2026',10)
 await db.query("INSERT IGNORE INTO clinic_branches (id,code,name,address,is_active) VALUES (2,'QA_TWO','Synthetic Second Branch','Synthetic Second Address',1)")
 await db.query("UPDATE clinic_branches SET google_maps_url='https://maps.app.goo.gl/SyntheticPin' WHERE id=1")
 await db.query("INSERT IGNORE INTO admins (id,full_name,email,password,account_role,branch_id,is_active) VALUES (2,'Synthetic Branch Admin','admin@qa.invalid',?,'admin',1,1)",[password])
 for(const permission of ['dashboard','appointments','patient_records','doctor_schedules','billing','inventory','accounts','system_setup','reports','audit_logs'])await db.query('INSERT IGNORE INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (2,?,1)',[permission])
 await db.query("INSERT IGNORE INTO staff (id,full_name,email,password,phone,status,branch_id) VALUES (1,'Synthetic Staff','staff@qa.invalid',?,'09170000001','active',1)",[password])
 for(const permission of ['dashboard','appointments','patient_records','doctor_schedules','checkout','billing','inventory','accounts','system_setup','reports','audit_logs'])await db.query('INSERT IGNORE INTO staff_permissions (staff_id,permission_key,granted) VALUES (1,?,1)',[permission])
 await db.query("INSERT IGNORE INTO doctors (id,full_name,email,password,phone,clinic_type,branch_id) VALUES (1,'Synthetic Doctor','doctor@qa.invalid',?,'09170000002','medical',1)",[password])
 await db.query('INSERT IGNORE INTO doctor_branch_assignments (doctor_id,branch_id) VALUES (1,1)')
 await db.query('INSERT IGNORE INTO branch_payment_settings (branch_id,cash_enabled) VALUES (1,1)')
 for(const [patientId,name,email,phone] of [[1,'Synthetic Patient One','patient1@qa.invalid','+639171234567'],[2,'Synthetic Patient Two','patient2@qa.invalid','+639171234568']])await db.query("INSERT IGNORE INTO patients (id,full_name,email,password,phone,birthdate,gender,sex,address,email_verified_at,phone_verified_at,is_profile_complete,onboarding_completed_at) VALUES (?,?,?,?,?,'1996-01-01','Female','Female','Synthetic Home',NOW(),NOW(),1,NOW())",[patientId,name,email,password,phone])
 for(const [role,dbRole,userId] of [['superadmin','admin',1],['admin','admin',2],['staff','staff',1],['doctor','doctor',1],['patient','patient',1]])tokens[role]=`${role}_token=${await makeSessionToken(dbRole,userId)}`
}
async function main(){
 try{
  await seed()
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
  base=`http://127.0.0.1:${server.address().port}`
  await check('Health and database readiness use real Express and MySQL',async()=>{assert.equal((await request('GET','/api/health')).status,200);assert.equal((await request('GET','/api/ready')).status,200)})
  await check('Unknown API and webhook GET return JSON with the correct status',async()=>{assert.equal((await request('GET','/api/_qa_missing_route')).status,404);assert.equal((await request('GET','/api/webhooks/paymongo')).status,405)})
  await check('Untrusted browser origin is rejected as forbidden',async()=>{const res=await fetch(base+'/api/health',{headers:{Origin:'https://attacker.invalid'}});assert.equal(res.status,403)})
  for(const role of ['patient','doctor','staff','admin','superadmin'])await check(`${role} authenticated session check`,async()=>{const url=role==='superadmin'?'/api/admin/check-auth?portal=superadmin':`/api/${role}/check-auth`;const res=await request('GET',url,role);assert.equal(res.status,200);assert.equal(res.data.authenticated,true)})
  await check('Public branch response retains exact saved Maps pin and legacy NULL',async()=>{const res=await request('GET','/api/patient/branches');assert.equal(res.status,200);assert.equal(res.data.find(r=>r.id===1).google_maps_url,'https://maps.app.goo.gl/SyntheticPin');assert.equal(res.data.find(r=>r.id===2).google_maps_url,null)})
  for(const [label,search] of [['name','Synthetic Patient One'],['email','patient1@qa.invalid'],['local mobile','09171234567'],['international mobile','639171234567']])await check('Patient directory search by '+label,async()=>{const res=await request('GET',`/api/superadmin/patients?search=${encodeURIComponent(search)}`,'superadmin');assert.equal(res.status,200);assert.equal(res.data.items.length,1);assert.equal(res.data.items[0].id,1)})
  await check('Patient details retain gender/address and paginated history',async()=>{const res=await request('GET','/api/superadmin/patients/1','superadmin');assert.equal(res.status,200);assert.equal(res.data.patient.gender,'Female');assert.equal(res.data.patient.address,'Synthetic Home');assert.ok(Array.isArray(res.data.history.items))})
  await check('Patient directory rejects invalid IDs and nonexistent accounts',async()=>{assert.equal((await request('GET','/api/superadmin/patients/invalid','superadmin')).status,400);assert.equal((await request('GET','/api/superadmin/patients/99999','superadmin')).status,404)})
  for(const role of ['patient','staff','doctor','admin'])await check(`${role} cannot access the Super Admin patient directory`,async()=>{assert.ok([401,403].includes((await request('GET','/api/superadmin/patients',role)).status))})
  await check('Ban input requires a boolean',async()=>{assert.equal((await request('PATCH','/api/superadmin/patients/1/ban','superadmin',{banned:'true'})).status,400)})
  await check('Patient ban revokes an existing session and returns restriction message',async()=>{assert.equal((await request('PATCH','/api/superadmin/patients/1/ban','superadmin',{banned:true})).status,200);const res=await request('GET','/api/patient/appointments','patient');assert.equal(res.status,403);assert.equal(res.data.code,'PATIENT_ACCOUNT_BANNED')})
  await check('Unban preserves revocation of the old token; a new session can sign in',async()=>{assert.equal((await request('PATCH','/api/superadmin/patients/1/ban','superadmin',{banned:false})).status,200);assert.equal((await request('GET','/api/patient/appointments','patient')).status,401);tokens.patient='patient_token='+await makeSessionToken('patient',1);assert.equal((await request('GET','/api/patient/appointments','patient')).status,200)})
  await check('Branch create rejects unrelated and non-HTTPS Maps links without inserting rows',async()=>{const [[before]]=await db.query('SELECT COUNT(*) AS n FROM clinic_branches');for(const value of ['https://example.com/maps','http://google.com/maps','https://google.com/maps.evil','https://maps.app.goo.gl/'])assert.equal((await request('POST','/api/branches','superadmin',{name:'Synthetic Invalid Maps',google_maps_url:value})).status,400);const [[after]]=await db.query('SELECT COUNT(*) AS n FROM clinic_branches');assert.equal(after.n,before.n)})
  await check('Branch create/update preserve saved Google Maps destination',async()=>{const map='https://www.google.com/maps/place/SyntheticClinic';const created=await request('POST','/api/branches','superadmin',{name:'Synthetic New Branch '+Date.now(),address:'Synthetic Address',google_maps_url:map,setup_mode:'blank'});assert.equal(created.status,201);assert.ok(created.data.id);const updated=await request('PUT',`/api/branches/${created.data.id}`,'superadmin',{name:'Synthetic Updated Branch '+Date.now(),google_maps_url:map+'Two'});assert.equal(updated.status,200);const [[branch]]=await db.query('SELECT google_maps_url FROM clinic_branches WHERE id=?',[created.data.id]);assert.equal(branch.google_maps_url,map+'Two')})
  for(const role of ['admin','staff'])await check(`${role} cannot change another branch by supplying a branch ID`,async()=>{const res=await request('GET','/api/branches/workspace/2/legacy/billing',role);assert.ok([401,403].includes(res.status))})
  await check('A multi-branch doctor cannot start another branch consultation from the selected branch',async()=>{
   const current=tokens.doctor
   await db.query('INSERT IGNORE INTO doctor_branch_assignments (doctor_id,branch_id) VALUES (1,2)')
   try{
    const selected=await request('POST','/api/doctor/branches/select','doctor',{branch_id:1});assert.equal(selected.status,200)
    const branchCookie=selected.headers.getSetCookie().find(value=>value.startsWith('doctor_active_branch='));assert.ok(branchCookie);tokens.doctor=current+'; '+branchCookie.split(';')[0]
    const foreign=await insert('appointments',{patient_id:2,doctor_id:1,clinic_type:'medical',appointment_date:require('../../server/utils/date').getTodayDateOnly(),appointment_time:'09:00',status:'confirmed',branch_id:2})
    const attempted=await request('PATCH',`/api/doctor/appointments/${foreign}/start`,'doctor',{})
    assert.equal(attempted.status,404)
    const [[record]]=await db.query('SELECT status FROM appointments WHERE id=?',[foreign]);assert.equal(record.status,'confirmed')
   }finally{tokens.doctor=current;await db.query('DELETE FROM doctor_branch_assignments WHERE doctor_id=1 AND branch_id=2')}
  })
  let billingId, adjustmentId, clinicalAppointmentId, clinicalRecordId
  let expectedBalance=945, confirmationVersion=2
  await check('Create a synthetic completed consultation and its itemized draft bill',async()=>{
   const serviceId=await insert('billing_service_catalog',{category:'Synthetic QA',service_name:'Synthetic Service '+Date.now(),default_price:1000,consultation_fee:1000,branch_id:1,clinic_type:'medical',is_active:1})
   const appointmentId=await insert('appointments',{patient_id:1,doctor_id:1,clinic_type:'medical',appointment_date:'2026-11-09',appointment_time:'09:00',status:'completed',branch_id:1})
   const consultationId=await insert('consultations',{appointment_id:appointmentId,patient_id:1,doctor_id:1,status:'finalized',branch_id:1})
   clinicalAppointmentId=appointmentId;clinicalRecordId=consultationId
   billingId=await insert('billing_records',{appointment_id:appointmentId,consultation_id:consultationId,patient_id:1,doctor_id:1,status:'draft',version:1,subtotal:1000,total_amount:1000,branch_id:1})
   await insert('billing_items',{billing_id:billingId,catalog_service_id:serviceId,item_type:'service',source_type:'consultation',source_reference_id:consultationId,service_name:'Synthetic Service',quantity:1,unit_price:1000,line_total:1000,details_json:JSON.stringify({pricing:{consultation_fee:1000},materials:[]})})
   const result=await request('POST',`/api/staff/billing/${billingId}/charge-adjustments`,'staff',{target_type:'service_fee',catalog_service_id:serviceId,amount:55,reason:'Synthetic patient courtesy'})
   assert.equal(result.status,200);assert.ok(result.data.id);adjustmentId=result.data.id
   const [[entry]]=await db.query('SELECT status,requester_role FROM billing_charge_adjustments WHERE id=?',[adjustmentId]);assert.equal(entry.status,'pending');assert.equal(entry.requester_role,'staff')
  })
  if(billingId&&adjustmentId){
   await check('Billing-only Staff can read reductions without gaining permission to submit them',async()=>{await db.query("UPDATE staff_permissions SET granted=0 WHERE staff_id=1 AND permission_key='checkout'");try{assert.equal((await request('GET',`/api/staff/billing/${billingId}/charge-adjustments`,'staff')).status,200);assert.equal((await request('POST',`/api/staff/billing/${billingId}/charge-adjustments`,'staff',{})).status,403)}finally{await db.query("UPDATE staff_permissions SET granted=1 WHERE staff_id=1 AND permission_key='checkout'")}})
   await check('Doctor can request and cancel their own reduction but cannot cancel a Staff request',async()=>{
    const [[item]]=await db.query('SELECT catalog_service_id FROM billing_items WHERE billing_id=? LIMIT 1',[billingId])
    const created=await request('POST',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments`,'doctor',{target_type:'service_fee',catalog_service_id:item.catalog_service_id,amount:10,reason:'Synthetic doctor request'})
    assert.equal(created.status,201);assert.ok(created.data.id)
    const view=await request('GET',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments`,'doctor');assert.equal(view.status,200);assert.equal(view.data.actor.id,1)
    assert.equal((await request('DELETE',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments/${adjustmentId}`,'doctor')).status,403)
    assert.equal((await request('DELETE',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments/${created.data.id}`,'doctor')).status,200)
   })
   await check('Doctor draft requests stay pending until clinical completion; Admin cannot apply money early',async()=>{
    const [[item]]=await db.query('SELECT catalog_service_id FROM billing_items WHERE billing_id=? LIMIT 1',[billingId])
    await db.query("UPDATE consultations SET status='draft' WHERE id=?",[clinicalRecordId])
    try{
     const created=await request('POST',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments`,'doctor',{target_type:'service_fee',catalog_service_id:item.catalog_service_id,amount:10,reason:'Synthetic pending clinical request'})
     assert.equal(created.status,201)
     const approval=await request('PATCH',`/api/branches/my/legacy/billing/${billingId}/charge-adjustments/${created.data.id}`,'admin',{status:'approved'});assert.equal(approval.status,409);assert.equal(approval.data.code,'CONSULTATION_NOT_COMPLETED')
     const direct=await request('POST',`/api/branches/my/legacy/billing/${billingId}/charge-adjustments`,'admin',{target_type:'service_fee',catalog_service_id:item.catalog_service_id,amount:1,reason:'Synthetic forbidden early direct reduction'});assert.equal(direct.status,409)
     assert.equal((await request('DELETE',`/api/doctor/consultations/${clinicalAppointmentId}/charge-adjustments/${created.data.id}`,'doctor')).status,200)
    }finally{await db.query("UPDATE consultations SET status='finalized' WHERE id=?",[clinicalRecordId])}
   })
   for(const role of ['admin','staff'])await check(`${role} confirmation refuses a pending charge reduction without changing the bill`,async()=>{const prefix=role==='admin'?'/api/branches/my/legacy':'/api/staff';const res=await request('POST',`${prefix}/billing/${billingId}/finalize`,role,{expected_version:1});assert.equal(res.status,409);assert.equal(res.data.code,'PENDING_BILLING_APPROVAL');const [[bill]]=await db.query('SELECT status,version FROM billing_records WHERE id=?',[billingId]);assert.equal(bill.status,'draft');assert.equal(bill.version,1)})
   await check('Admin approval changes money and audit history without inventory writes',async()=>{const [[before]]=await db.query('SELECT COUNT(*) AS n FROM inventory_logs');const res=await request('PATCH',`/api/branches/my/legacy/billing/${billingId}/charge-adjustments/${adjustmentId}`,'admin',{status:'approved'});assert.equal(res.status,200);const [[bill]]=await db.query('SELECT total_amount,discount_amount,version FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(bill.total_amount),945);assert.equal(Number(bill.discount_amount),55);assert.equal(bill.version,2);const [[after]]=await db.query('SELECT COUNT(*) AS n FROM inventory_logs');assert.equal(after.n,before.n)})
   for(const role of ['admin','superadmin'])await check(`${role} applies a direct reduction with one audit event and no inventory changes`,async()=>{
    const [[item]]=await db.query('SELECT catalog_service_id FROM billing_items WHERE billing_id=? LIMIT 1',[billingId])
    const [[before]]=await db.query('SELECT COUNT(*) AS n FROM audit_logs')
    const [[inventoryBefore]]=await db.query('SELECT COUNT(*) AS n FROM inventory_logs')
    const prefix=role==='admin'?'/api/branches/my/legacy':'/api/branches/workspace/1/legacy'
    const reduction=role==='admin'?20:10
    const created=await request('POST',`${prefix}/billing/${billingId}/charge-adjustments`,role,{target_type:'service_fee',catalog_service_id:item.catalog_service_id,amount:reduction,reason:'Synthetic authorized direct reduction'})
    assert.equal(created.status,200);assert.ok(created.data.id)
    const [[entry]]=await db.query('SELECT status,approved_by_admin_id,admin_note FROM billing_charge_adjustments WHERE id=?',[created.data.id]);assert.equal(entry.status,'approved');assert.equal(entry.approved_by_admin_id,role==='admin'?2:1);assert.equal(entry.admin_note,'Authorized direct adjustment')
    const [[bill]]=await db.query('SELECT total_amount,version FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(bill.total_amount),expectedBalance-reduction);assert.equal(bill.version,confirmationVersion+1)
    const [[after]]=await db.query('SELECT COUNT(*) AS n FROM audit_logs');assert.equal(after.n,before.n+1)
    const [[inventoryAfter]]=await db.query('SELECT COUNT(*) AS n FROM inventory_logs');assert.equal(inventoryAfter.n,inventoryBefore.n)
    expectedBalance-=reduction;confirmationVersion++
   })
   await check('Admin confirms a completed consultation after all reductions are resolved',async()=>{const res=await request('POST',`/api/branches/my/legacy/billing/${billingId}/finalize`,'admin',{expected_version:confirmationVersion});assert.equal(res.status,200);assert.equal(res.data.status,'ready')})
   await check('Cash payment creates one receipt; retry cannot collect twice',async()=>{const body={payment_method:'cash',payment_amount:expectedBalance,amount_received:1000,idempotency_key:'synthetic-qa-payment-'+billingId};const paid=await request('POST',`/api/staff/billing/${billingId}/pay`,'staff',body);assert.equal(paid.status,200);assert.equal(paid.data.status,'paid');assert.equal(Number(paid.data.balance_amount),0);assert.ok(paid.data.payments[0].receipt_number);const retry=await request('POST',`/api/staff/billing/${billingId}/pay`,'staff',body);assert.equal(retry.status,200);const [[rows]]=await db.query('SELECT COUNT(*) AS n,SUM(amount) AS amount FROM billing_payments WHERE billing_id=?',[billingId]);assert.equal(rows.n,1);assert.equal(Number(rows.amount),expectedBalance)})
   await check('Paid bills reject new charge reductions',async()=>{const [[item]]=await db.query('SELECT catalog_service_id FROM billing_items WHERE billing_id=? LIMIT 1',[billingId]);const res=await request('POST',`/api/staff/billing/${billingId}/charge-adjustments`,'staff',{target_type:'service_fee',catalog_service_id:item.catalog_service_id,amount:1,reason:'Synthetic invalid late reduction'});assert.equal(res.status,409);assert.equal(res.data.code,'BILL_LOCKED')})
   await check('Notification destination uses the authenticated Admin route and branch',async()=>{const notificationId=await insert('notifications',{target_role:'admin',target_user_id:2,branch_id:1,type:'billing_ready',title:'Synthetic bill',message:'Synthetic notification',reference_type:'billing_record',reference_id:billingId});const res=await request('GET',`/api/branches/my/notifications/${notificationId}/destination`,'admin');assert.equal(res.status,200);assert.equal(res.data.path,`/admin/billing/checkout/${billingId}`)})
  }
  await check('Injected database outage returns readiness 503 and a safe request reference',async()=>{
   const original=db.query
   db.query=async()=>{throw Object.assign(new Error('Synthetic private driver diagnostic'),{code:'ECONNRESET'})}
   try{assert.equal((await request('GET','/api/ready')).status,503);const res=await request('GET','/api/superadmin/patients','superadmin');assert.equal(res.status,500);assert.ok(res.data.request_id);assert.ok(!res.data.message.includes('Synthetic private driver diagnostic'));assert.equal(res.data.stack,undefined)}finally{db.query=original}
  })
  const protectedPrefix=/^\/api\/(?:patient|doctor|staff|admin|branches|superadmin)(?:\/|$)/
  const publicPath=/\/(?:login(?:\/mfa)?|logout|check-auth|register(?:\/verify|\/resend)?|booking-policy|forgot-password|reset-password|verify-otp|resend-otp)$/
  for(const endpoint of endpoints){
   if(endpoint.method==='USE'||endpoint.method==='_ALL')continue
   if(!protectedPrefix.test(endpoint.path)||publicPath.test(endpoint.path)||endpoint.path==='/api/patient/branches')continue
   const url=endpoint.path.replace(/:[A-Za-z_][\w]*(?:\([^)]*\))?\??/g,'1')
   try{
    const response=await request(endpoint.method,url,undefined,['GET','HEAD'].includes(endpoint.method)?undefined:{})
    endpoint.anonymous_http=response.status;endpoint.anonymous=[401,403].includes(response.status)?'PASS':'FAIL'
    const role=endpoint.path.startsWith('/api/branches')?(endpoint.path.startsWith('/api/branches/my')?'admin':'superadmin'):endpoint.path.startsWith('/api/superadmin')?'superadmin':endpoint.path.startsWith('/api/admin')?'superadmin':endpoint.path.split('/')[2]
    const previous=tokens[role]
    tokens[role]=`${role}_token=${jwt.sign({id:role==='admin'?2:1,role:role==='superadmin'?'admin':role,session_version:1},process.env.JWT_SECRET,{expiresIn:-1})}`
    try{const expired=await request(endpoint.method,url,role,['GET','HEAD'].includes(endpoint.method)?undefined:{});endpoint.expired_http=expired.status;endpoint.expired=[401,403].includes(expired.status)?'PASS':'FAIL'}finally{tokens[role]=previous}
   }catch(error){endpoint.anonymous='BLOCKED';endpoint.error=error.message}
  }
  const literals=JSON.parse(fs.readFileSync(path.join(out,'sql-inventory.json'))).filter(row=>row.queryArgument&&row.file.startsWith('server/')&&!/\/(?:tests|scripts)\//.test(row.file)&&!row.dynamic&&/^\s*SELECT\b/i.test(row.sql)&&!/[;]|\b(?:GET_LOCK|RELEASE_LOCK|SLEEP|BENCHMARK|INTO\s+(?:OUTFILE|DUMPFILE))\b/i.test(row.sql))
  for(const row of literals){try{await db.query('EXPLAIN '+row.sql,Array((row.sql.match(/\?/g)||[]).length).fill(1));sqlResults.push({file:row.file,line:row.line,status:'PASS'})}catch(error){sqlResults.push({file:row.file,line:row.line,status:'FAIL',code:error.code,message:error.sqlMessage})}}
 }finally{
  const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n')+'\n'
  fs.writeFileSync(path.join(out,'API_ENDPOINT_AUDIT.csv'),csv([['method','mounted_path','callbacks','anonymous_access','anonymous_http','expired_session','valid_request','invalid_input','branch_isolation','notes'],...endpoints.map(e=>[e.method,e.path,e.handlers.join('; '),e.anonymous,e.anonymous_http,e.expired,'NOT TESTED — see named workflow cases','NOT TESTED — see named workflow cases','NOT TESTED — see named workflow cases','Runtime registration and anonymous requests do not establish complete endpoint coverage'])]))
  const summary={results,endpoints,sqlResults,executions,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,anonymousPassed:endpoints.filter(e=>e.anonymous==='PASS').length,anonymousFailed:endpoints.filter(e=>e.anonymous==='FAIL').length,expiredPassed:endpoints.filter(e=>e.expired==='PASS').length,expiredFailed:endpoints.filter(e=>e.expired==='FAIL').length,isolatedOnly:true,productionMutations:0}
  fs.writeFileSync(path.join(out,'api-smoke-results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({cases:results.length,passed:summary.passed,failed:summary.failed,endpoints:endpoints.length,anonymousPassed:summary.anonymousPassed,anonymousFailed:summary.anonymousFailed,sqlPlans:sqlResults.length,sqlFailed:sqlResults.filter(r=>r.status==='FAIL').length}))
  await new Promise(resolve=>server?server.close(resolve):resolve());await db.end()
  if(summary.failed||summary.anonymousFailed||summary.expiredFailed||sqlResults.some(r=>r.status==='FAIL'))process.exitCode=1
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
