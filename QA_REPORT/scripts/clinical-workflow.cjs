'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_PORT!=='33409'||process.env.DB_NAME!=='carait_qa_20261109')throw Error('Only the disposable synthetic database is authorized')
// These overrides apply to this child process and the synthetic branch only.
Object.assign(process.env,{ADMIN_MFA_ENABLED:'false',CARAIT_ALLOW_ZERO_BOOKING_NOTICE_FOR_TESTS:'true',CARAIT_ZERO_BOOKING_NOTICE_TEST_BRANCH_IDS:'1'})
const {app}=require('../../server/server'),db=require('../../server/db/connect'),bcrypt=require('../../server/node_modules/bcrypt')
const {makeSessionToken}=require('../../server/utils/sessionSecurity'),{getTodayDateOnly}=require('../../server/utils/date')
const results=[],executions=[],cookies={};let server,base,active='',savedPolicy
const insert=async(table,row)=>{assert.match(table,/^[a-z_]+$/);const keys=Object.keys(row);const [r]=await db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(row));return r.insertId}
const check=async(name,fn)=>{active=name;try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',reason:e.message.slice(0,1200)});console.log('FAIL '+name+': '+e.message.slice(0,250))}finally{active=''}}
const req=async(method,url,role,body)=>{const r=await fetch(base+url,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),...(body?{'Content-Type':'application/json'}:{}),...(role==='superadmin'?{'X-Admin-Portal':'superadmin'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});const data=await r.json();executions.push({case:active,method,path:url,status:r.status,role});return {status:r.status,data,headers:r.headers}}
const expectStatus=(r,s)=>assert.equal(r.status,s,JSON.stringify(r.data))
async function main(){
 try{
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});base=`http://127.0.0.1:${server.address().port}`
  const password='SyntheticQa!2026',hash=await bcrypt.hash(password,10),unique=Date.now()
  const patientId=await insert('patients',{full_name:'Synthetic Complete Workflow',email:`workflow${unique}@qa.invalid`,password:hash,phone:'+639189876543',birthdate:'1996-01-01',gender:'Female',sex:'Female',civil_status:'Single',address:'Synthetic Address',email_verified_at:new Date(),phone_verified_at:new Date(),is_profile_complete:1,onboarding_completed_at:new Date(),consent_given:1})
  const doctorId=await insert('doctors',{full_name:'Synthetic Workflow Doctor',email:`doctor${unique}@qa.invalid`,password:hash,phone:'09189999999',clinic_type:'medical',branch_id:1,is_active:1})
  await insert('doctor_branch_assignments',{doctor_id:doctorId,branch_id:1,is_active:1})
  const day=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'Asia/Manila'}).format(new Date())
  await insert('doctor_schedules',{doctor_id:doctorId,branch_id:1,day_of_week:day,start_time:'00:00',end_time:'00:00',is_24_hours:1,is_active:1})
  const [[location]]=await db.query('SELECT id,name FROM inventory_locations WHERE branch_id=1 AND is_main_stockroom=1 AND is_active=1 LIMIT 1')
  const room=location||{id:await insert('inventory_locations',{name:'Synthetic Main Stockroom',location_type:'stockroom',is_main_stockroom:1,branch_id:1}),name:'Synthetic Main Stockroom'}
  const inventoryId=await insert('inventory',{name:'Synthetic Workflow Gauze '+unique,category:'medical',unit:'unit',base_unit:'unit',uom:'unit',stock:10,stock_base:10,branch_id:1,default_location_id:room.id})
  const batchId=await insert('inventory_batches',{inventory_id:inventoryId,batch_code:'QA-'+unique,quantity:10,expiration_date:'2028-12-31',branch_id:1})
  await insert('inventory_location_batches',{location_id:room.id,inventory_id:inventoryId,batch_id:batchId,quantity:10})
  await insert('inventory_location_stock',{location_id:room.id,inventory_id:inventoryId,quantity:10})
  const serviceId=await insert('billing_service_catalog',{category:'Synthetic QA',service_name:'Synthetic Workflow Service '+unique,default_price:500,consultation_fee:500,branch_id:1,clinic_type:'medical',average_duration_minutes:30,is_active:1})
  await insert('billing_service_materials',{billing_service_id:serviceId,inventory_id:inventoryId,material_name:'Synthetic Gauze',quantity:1,unit_label:'unit'})
  const [policies]=await db.query('SELECT * FROM branch_booking_settings WHERE branch_id=1');savedPolicy=policies[0]||null
  await db.query('INSERT INTO branch_booking_settings (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes) VALUES (1,0,0) ON DUPLICATE KEY UPDATE online_min_lead_minutes=0,pending_confirmation_cutoff_minutes=0')
  for(const [role,table,id] of [['admin','admins',2],['superadmin','admins',1],['staff','staff',1]]){
   cookies[role]=`${role}_token=${await makeSessionToken(role==='superadmin'?'admin':role,id)}`
   const [[row]]=await db.query(`SELECT email FROM ${table} WHERE id=?`,[id]);await db.query(`UPDATE ${table} SET password=? WHERE id=?`,[hash,id])
   await check(`${role} password login with local-only MFA override`,async()=>{const r=await req('POST',`/api/${role==='superadmin'?'admin':role}/login`,undefined,{email:row.email,password,...(['admin','superadmin'].includes(role)?{portal:role}:{})});expectStatus(r,200);assert.ok(r.headers.getSetCookie().some(s=>s.startsWith(`${role}_token=`)))})
  }
  for(const [role,id,email] of [['patient',patientId,`workflow${unique}@qa.invalid`],['doctor',doctorId,`doctor${unique}@qa.invalid`]])await check(`${role} actual password login returns HttpOnly session cookie`,async()=>{const r=await req('POST',`/api/${role}/login`,undefined,{email,password});expectStatus(r,200);const c=r.headers.getSetCookie().find(s=>s.startsWith(`${role}_token=`));assert.ok(c);assert.match(c,/HttpOnly/i);cookies[role]=c.split(';')[0]})
  let appointmentId,queueId,billingId,version=1
  const today=getTodayDateOnly(),time='23:00'
  await check('Patient books a same-day synthetic appointment through actual slot validation',async()=>{const r=await req('POST','/api/patient/appointments','patient',{branch_id:1,doctor_id:doctorId,clinic_type:'medical',requested_service_id:serviceId,reason:'Other',reason_details:'Synthetic full workflow',appointment_date:today,appointment_time:time});expectStatus(r,201);appointmentId=r.data.id;assert.ok(appointmentId)})
  if(appointmentId){
   await check('Staff confirms the booked appointment',async()=>{expectStatus(await req('PATCH',`/api/staff/appointments/${appointmentId}/confirm`,'staff',{}),200)})
   await check('Staff checks in the actual appointment; duplicate check-in cannot create a second queue row',async()=>{const body={patient_id:patientId,doctor_id:doctorId,type:'medical',check_in_appointment_id:appointmentId};const r=await req('POST','/api/staff/queue','staff',body);expectStatus(r,201);queueId=r.data.id;expectStatus(await req('POST','/api/staff/queue','staff',body),409);const [[c]]=await db.query('SELECT COUNT(*) AS n FROM queue WHERE appointment_id=?',[appointmentId]);assert.equal(c.n,1)})
   if(queueId)await check('Staff calls the patient and Doctor starts consultation',async()=>{expectStatus(await req('PATCH',`/api/staff/queue/${queueId}/status`,'staff',{status:'called'}),200);expectStatus(await req('PATCH',`/api/doctor/appointments/${appointmentId}/start`,'doctor',{}),200)})
   const payload={diagnosis:'Synthetic wound assessment',prescription_status:'prescribed',prescription:JSON.stringify([{medicine:'Synthetic medicine',quantity:'1',frequency:'Once daily',notes:'Synthetic only'}]),billable_services:[{catalog_service_id:serviceId,quantity:1,materials:[{inventory_id:inventoryId,quantity:1,unit_label:'unit'}]}]}
   await check('Doctor saves a versioned draft without inventory deduction',async()=>{const r=await req('PUT',`/api/doctor/consultations/${appointmentId}/draft`,'doctor',payload);expectStatus(r,200);version=r.data.version||r.data.consultation_version||1;const [[b]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(b.quantity),10)})
   await check('Insufficient stock rolls back finalization and clinical state',async()=>{await db.query('UPDATE inventory_batches SET quantity=0 WHERE id=?',[batchId]);try{const r=await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version});expectStatus(r,409);assert.equal(r.data.code,'INVENTORY_INSUFFICIENT');const [[c]]=await db.query('SELECT status FROM consultations WHERE appointment_id=?',[appointmentId]);assert.equal(c.status,'draft')}finally{await db.query('UPDATE inventory_batches SET quantity=10 WHERE id=?',[batchId])}})
   await check('Doctor finalizes once, deducting exactly one unit and retaining prescription',async()=>{const r=await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version});expectStatus(r,200);billingId=r.data.billing.id;const [[b]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(b.quantity),9);const [[c]]=await db.query('SELECT status,prescription FROM consultations WHERE appointment_id=?',[appointmentId]);assert.equal(c.status,'finalized');assert.match(c.prescription,/Synthetic medicine/);expectStatus(await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version}),409);const [[retry]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(retry.quantity),9)})
   if(billingId){
    await check('Staff confirms the completed bill and collects cash exactly once',async()=>{const [[b]]=await db.query('SELECT version,total_amount FROM billing_records WHERE id=?',[billingId]);expectStatus(await req('POST',`/api/staff/billing/${billingId}/finalize`,'staff',{expected_version:b.version}),200);const body={payment_method:'cash',payment_amount:Number(b.total_amount),amount_received:1000,idempotency_key:'qa-workflow-'+billingId};const r=await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',body);expectStatus(r,200);assert.equal(r.data.status,'paid');assert.ok(r.data.payments[0].receipt_number);expectStatus(await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',body),200);const [[c]]=await db.query('SELECT COUNT(*) AS n FROM billing_payments WHERE billing_id=?',[billingId]);assert.equal(c.n,1)})
    await check('Patient history contains the same paid bill; another patient cannot read it',async()=>{const r=await req('GET',`/api/patient/billing/history/${billingId}`,'patient');expectStatus(r,200);assert.equal(Number(r.data.id||r.data.bill?.id),billingId);const current=cookies.patient;cookies.patient='patient_token='+await makeSessionToken('patient',2);try{expectStatus(await req('GET',`/api/patient/billing/history/${billingId}`,'patient'),404)}finally{cookies.patient=current}})
   }
  }
  await check('Patient logout invalidates the current session',async()=>{expectStatus(await req('POST','/api/patient/logout','patient',{}),200);expectStatus(await req('GET','/api/patient/appointments','patient'),401)})
 }finally{
  if(savedPolicy)await db.query('UPDATE branch_booking_settings SET online_min_lead_minutes=?,pending_confirmation_cutoff_minutes=? WHERE branch_id=1',[savedPolicy.online_min_lead_minutes,savedPolicy.pending_confirmation_cutoff_minutes]);else await db.query('DELETE FROM branch_booking_settings WHERE branch_id=1')
  fs.writeFileSync(path.resolve(__dirname,'../evidence/clinical-workflow-results.json'),JSON.stringify({results,executions,isolatedDatabase:true,providerDeliveryTested:false,adminMfaDeliveryTested:false,sameDayPolicyOverride:'Local process and synthetic branch 1 only',productionMutations:0},null,2))
  console.log(JSON.stringify({cases:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length}))
  await new Promise(resolve=>server?server.close(resolve):resolve());await db.end();if(results.some(r=>r.status==='FAIL'))process.exitCode=1
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
