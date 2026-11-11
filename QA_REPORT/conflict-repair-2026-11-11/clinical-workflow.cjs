'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_PORT!=='33411'||process.env.DB_NAME!=='carait_merge_qa_20261111')throw Error('Only the disposable synthetic database is authorized')
// These overrides apply to this child process and the synthetic branch only.
Object.assign(process.env,{ADMIN_MFA_ENABLED:'false',CARAIT_ALLOW_ZERO_BOOKING_NOTICE_FOR_TESTS:'true',CARAIT_ZERO_BOOKING_NOTICE_TEST_BRANCH_IDS:'1'})
const {app}=require('../../server/server'),db=require('../../server/db/connect'),bcrypt=require('../../server/node_modules/bcrypt')
const {makeSessionToken}=require('../../server/utils/sessionSecurity'),{getTodayDateOnly}=require('../../server/utils/date')
const results=[],executions=[],cookies={};let server,base,active='',savedPolicy,browser,policyChanged=false
const insert=async(table,row)=>{assert.match(table,/^[a-z_]+$/);const keys=Object.keys(row);const [r]=await db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(row));return r.insertId}
const check=async(name,fn)=>{active=name;try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',reason:e.message.slice(0,1200)});console.log('FAIL '+name+': '+e.message.slice(0,250))}finally{active=''}}
const req=async(method,url,role,body)=>{const r=await fetch(base+url,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),...(body?{'Content-Type':'application/json'}:{}),...(role==='superadmin'?{'X-Admin-Portal':'superadmin'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});const data=await r.json();executions.push({case:active,method,path:url,status:r.status,role});return {status:r.status,data,headers:r.headers}}
const expectStatus=(r,s)=>assert.equal(r.status,s,JSON.stringify(r.data))
const withPage=async(role,fn)=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.addCookies([{name:role+'_token',value:cookies[role].split(';')[0].split('=').slice(1).join('='),url:base,httpOnly:true}])
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
 const page=await context.newPage()
 page.setDefaultTimeout(12000)
 try{await fn(page,require('../../client/node_modules/@playwright/test').expect)}catch(e){fs.writeFileSync(path.resolve(__dirname,'browser-artifacts/native-'+role+'-failure.txt'),await page.locator('body').innerText());await page.screenshot({path:path.resolve(__dirname,'browser-artifacts/native-'+role+'-failure.png'),fullPage:true});throw e}finally{await context.close()}
}
async function main(){
 try{
  const express=require('../../server/node_modules/express'),dist=path.resolve(__dirname,'../../client/dist')
  app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')))
  server=await new Promise(resolve=>{const s=app.listen(4187,'127.0.0.1',()=>resolve(s))});base=`http://127.0.0.1:${server.address().port}`
  browser=await require('../../client/node_modules/@playwright/test').chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})
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
  const promotionId=await insert('clinic_promotions',{title:'Synthetic 100 peso promotion '+unique,description:'Synthetic test promotion',badge_text:'Synthetic',starts_on:getTodayDateOnly(),ends_on:'2026-12-31',is_active:1,branch_id:1,discount_type:'fixed',discount_value:100})
  await insert('clinic_promotion_services',{promotion_id:promotionId,service_id:serviceId})
  await insert('billing_service_materials',{billing_service_id:serviceId,inventory_id:inventoryId,material_name:'Synthetic Gauze',quantity:1,unit_label:'unit'})
  const [policies]=await db.query('SELECT * FROM branch_booking_settings WHERE branch_id=1');savedPolicy=policies[0]||null
  await db.query('INSERT INTO branch_booking_settings (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes) VALUES (1,0,0) ON DUPLICATE KEY UPDATE online_min_lead_minutes=0,pending_confirmation_cutoff_minutes=0')
  policyChanged=true
  for(const [role,table,id] of [['admin','admins',2],['superadmin','admins',1],['staff','staff',1]]){
   cookies[role]=`${role}_token=${await makeSessionToken(role==='superadmin'?'admin':role,id)}`
   const [[row]]=await db.query(`SELECT email FROM ${table} WHERE id=?`,[id]);await db.query(`UPDATE ${table} SET password=? WHERE id=?`,[hash,id])
   await check(`${role} password login with local-only MFA override`,async()=>{const r=await req('POST',`/api/${role==='superadmin'?'admin':role}/login`,undefined,{email:row.email,password,...(['admin','superadmin'].includes(role)?{portal:role}:{})});expectStatus(r,200);assert.ok(r.headers.getSetCookie().some(s=>s.startsWith(`${role}_token=`)))})
  }
  for(const [role,id,email] of [['patient',patientId,`workflow${unique}@qa.invalid`],['doctor',doctorId,`doctor${unique}@qa.invalid`]])await check(`${role} actual password login returns HttpOnly session cookie`,async()=>{const r=await req('POST',`/api/${role}/login`,undefined,{email,password});expectStatus(r,200);const c=r.headers.getSetCookie().find(s=>s.startsWith(`${role}_token=`));assert.ok(c);assert.match(c,/HttpOnly/i);cookies[role]=c.split(';')[0]})
  let appointmentId,queueId,billingId,version=1
  const today=getTodayDateOnly(),time='23:00'
  await check('Patient books a same-day synthetic appointment through actual slot validation',async()=>{const r=await req('POST','/api/patient/appointments','patient',{branch_id:1,doctor_id:doctorId,clinic_type:'medical',requested_service_id:serviceId,promotion_id:promotionId,reason:'Other',reason_details:'Synthetic full workflow',appointment_date:today,appointment_time:time});expectStatus(r,201);appointmentId=r.data.id;assert.ok(appointmentId)})
  if(appointmentId){
   await check('Staff confirms the booked appointment',async()=>{expectStatus(await req('PATCH',`/api/staff/appointments/${appointmentId}/confirm`,'staff',{}),200)})
   await check('Staff checks in the actual appointment; duplicate check-in cannot create a second queue row',async()=>{const body={patient_id:patientId,doctor_id:doctorId,type:'medical',check_in_appointment_id:appointmentId};const r=await req('POST','/api/staff/queue','staff',body);expectStatus(r,201);queueId=r.data.id;expectStatus(await req('POST','/api/staff/queue','staff',body),409);const [[c]]=await db.query('SELECT COUNT(*) AS n FROM queue WHERE appointment_id=?',[appointmentId]);assert.equal(c.n,1)})
   if(queueId)await check('Staff calls the patient and Doctor starts consultation',async()=>{expectStatus(await req('PATCH',`/api/staff/queue/${queueId}/status`,'staff',{status:'called'}),200);expectStatus(await req('PATCH',`/api/doctor/appointments/${appointmentId}/start`,'doctor',{}),200)})
   const payload={diagnosis:'Synthetic wound assessment',prescription_status:'prescribed',prescription:JSON.stringify([{medicine:'Synthetic medicine',quantity:'1',frequency:'Once daily',notes:'Synthetic only'}]),billable_services:[{catalog_service_id:serviceId,quantity:1,materials:[{inventory_id:inventoryId,quantity:1,unit_label:'unit'}]}]}
   await check('Doctor saves a versioned draft without inventory deduction',async()=>{const r=await req('PUT',`/api/doctor/consultations/${appointmentId}/draft`,'doctor',payload);expectStatus(r,200);version=r.data.version||r.data.consultation_version||1;const [[b]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(b.quantity),10)})
   await check('Insufficient stock rolls back finalization and clinical state',async()=>{await db.query('UPDATE inventory_batches SET quantity=0 WHERE id=?',[batchId]);try{const r=await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version});expectStatus(r,409);assert.equal(r.data.code,'INVENTORY_INSUFFICIENT');const [[c]]=await db.query('SELECT status FROM consultations WHERE appointment_id=?',[appointmentId]);assert.equal(c.status,'draft')}finally{await db.query('UPDATE inventory_batches SET quantity=10 WHERE id=?',[batchId])}})
   await check('Doctor finalizes once, deducting exactly one unit and retaining prescription',async()=>{const r=await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version});expectStatus(r,200);billingId=r.data.billing.id;const [[b]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(b.quantity),9);const [[c]]=await db.query('SELECT status,prescription FROM consultations WHERE appointment_id=?',[appointmentId]);assert.equal(c.status,'finalized');assert.match(c.prescription,/Synthetic medicine/);expectStatus(await req('POST',`/api/doctor/consultations/${appointmentId}/finalize`,'doctor',{...payload,expected_version:version}),409);const [[retry]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(retry.quantity),9)})
   if(billingId){
    let doctorReduction,staffReduction
    const branchBase='/api/branches/my/legacy'
    await check('Doctor request and Admin approval preserve the 100 peso booking promotion',async()=>{
     const r=await req('POST',`/api/doctor/consultations/${appointmentId}/charge-adjustments`,'doctor',{target_type:'service_fee',catalog_service_id:serviceId,amount:50,reason:'Synthetic doctor concession'});expectStatus(r,201);doctorReduction=r.data.id
     expectStatus(await req('PATCH',`${branchBase}/billing/${billingId}/charge-adjustments/${doctorReduction}`,'admin',{status:'approved'}),200)
     const [[b]]=await db.query('SELECT total_amount,promotion_discount_amount FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(b.total_amount),350);assert.equal(Number(b.promotion_discount_amount),100)
    })
    await check('Reversal rejects invalid reasons, unauthorized roles and another branch',async()=>{
     expectStatus(await req('POST',`${branchBase}/billing/${billingId}/charge-adjustments/${doctorReduction}/reverse`,'admin',{reason:''}),400)
     for(const role of ['staff','doctor','patient'])assert.ok([401,403].includes((await req('POST',`${branchBase}/billing/${billingId}/charge-adjustments/${doctorReduction}/reverse`,role,{reason:'Synthetic denied reversal'})).status))
     expectStatus(await req('POST',`/api/branches/workspace/2/legacy/billing/${billingId}/charge-adjustments/${doctorReduction}/reverse`,'superadmin',{reason:'Synthetic wrong branch reversal'}),404)
    })
    await check('Simultaneous Admin and Super Admin reversals restore once and create one audit event',async()=>{
     const responses=await Promise.all([req('POST',`${branchBase}/billing/${billingId}/charge-adjustments/${doctorReduction}/reverse`,'admin',{reason:'Synthetic duplicate concession'}),req('POST',`/api/branches/workspace/1/legacy/billing/${billingId}/charge-adjustments/${doctorReduction}/reverse`,'superadmin',{reason:'Synthetic duplicate concession'})])
     assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(responses.find(r=>r.status===409).data.code,'REDUCTION_ALREADY_REVERSED')
     const [[b]]=await db.query('SELECT total_amount,discount_amount,promotion_discount_amount FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(b.total_amount),400);assert.equal(Number(b.discount_amount),100);assert.equal(Number(b.promotion_discount_amount),100)
     const [[a]]=await db.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action='billing.charge_adjustment_reversed' AND entity_id=?",[String(doctorReduction)]);assert.equal(a.n,1)
     const [[r]]=await db.query('SELECT * FROM billing_charge_adjustments WHERE id=?',[doctorReduction]);assert.equal(r.approved_by_admin_id,2);assert.equal(r.requester_role,'doctor');assert.equal(r.status,'reversed');assert.ok(r.reversed_at);assert.equal(r.reversal_reason,'Synthetic duplicate concession')
    })
    await check('Staff request approval then real Admin browser reversal immediately refreshes checkout totals',async()=>{
     const r=await req('POST',`/api/staff/billing/${billingId}/charge-adjustments`,'staff',{target_type:'service_fee',catalog_service_id:serviceId,amount:25,reason:'Synthetic staff concession'});expectStatus(r,200);staffReduction=r.data.id
     expectStatus(await req('PATCH',`${branchBase}/billing/${billingId}/charge-adjustments/${staffReduction}`,'admin',{status:'approved'}),200)
     await withPage('admin',async(page,expect)=>{
      await page.goto(base+`/admin/billing/checkout/${billingId}`)
      await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
      await page.getByRole('button',{name:'Reverse Reduction',exact:true}).click()
      const modal=page.getByRole('dialog',{name:'Reverse approved reduction?'})
      await expect(modal).toContainText('\u20b1375.00');await expect(modal).toContainText('\u20b1400.00')
      for(const width of [1440,900,390]){await page.setViewportSize({width,height:1000});await expect(modal).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.resolve(__dirname,`browser-artifacts/reversal-${width}.png`),fullPage:true})}
      await expect(modal.getByRole('button',{name:'Confirm Reversal'})).toBeDisabled()
      await modal.getByLabel('Reversal reason').fill('Synthetic browser financial correction')
      await modal.getByRole('button',{name:'Confirm Reversal'}).click()
      await expect(modal).not.toBeVisible();await expect(page.getByText('\u20b1400.00',{exact:true}).first()).toBeVisible()
     })
     const [[b]]=await db.query('SELECT total_amount FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(b.total_amount),400)
     const [[stock]]=await db.query('SELECT quantity FROM inventory_batches WHERE id=?',[batchId]);assert.equal(Number(stock.quantity),9)
    })
    await check('Super Admin directly applies and successfully reverses a separate reduction in the selected branch',async()=>{
     const workspace=`/api/branches/workspace/1/legacy/billing/${billingId}/charge-adjustments`
     const applied=await req('POST',workspace,'superadmin',{target_type:'service_fee',catalog_service_id:serviceId,amount:15,reason:'Synthetic Super Admin courtesy'})
     expectStatus(applied,200)
     const reversed=await req('POST',`${workspace}/${applied.data.id}/reverse`,'superadmin',{reason:'Synthetic Super Admin correction'})
     expectStatus(reversed,200);assert.equal(reversed.data.status,'reversed');assert.equal(Number(reversed.data.total_amount),400)
     const [[entry]]=await db.query('SELECT status,approved_by_admin_id,reversed_by_admin_id,reversal_reason FROM billing_charge_adjustments WHERE id=?',[applied.data.id])
     assert.equal(entry.status,'reversed');assert.equal(entry.approved_by_admin_id,1);assert.equal(entry.reversed_by_admin_id,1);assert.equal(entry.reversal_reason,'Synthetic Super Admin correction')
     const [[event]]=await db.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action='billing.charge_adjustment_reversed' AND entity_id=?",[String(applied.data.id)])
     assert.equal(event.n,1)
    })
    await check('Both real medical-history screens display the saved prescription without JSON',async()=>{
     await withPage('admin',async(page,expect)=>{await page.goto(base+'/admin/patient-records');await page.getByLabel('Find a Patient').fill(`workflow${unique}@qa.invalid`);await expect(page.getByRole('button',{name:'View Record',exact:true})).toHaveCount(1);await page.getByRole('button',{name:'View Record',exact:true}).click();await page.getByRole('button',{name:'View Visit Details',exact:true}).first().click();await expect(page.getByText('Medicine 1: Synthetic medicine')).toBeVisible();await expect(page.getByText('Frequency:',{exact:true})).toBeVisible();for(const width of [1440,900,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.resolve(__dirname,`browser-artifacts/prescription-${page.url().includes('/admin/')?'admin':'patient'}-${width}.png`),fullPage:true})}})
     await withPage('patient',async(page,expect)=>{await page.goto(base+'/patient/history');await page.getByRole('button',{name:/Synthetic QA Branch/}).click();await page.getByRole('button',{name:'View Consultation Details',exact:true}).click();await expect(page.getByText('Medicine 1: Synthetic medicine')).toBeVisible();await expect(page.getByText('Frequency:',{exact:true})).toBeVisible();for(const width of [1440,900,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.resolve(__dirname,`browser-artifacts/prescription-${page.url().includes('/admin/')?'admin':'patient'}-${width}.png`),fullPage:true})}})
    })
    await check('Staff partial and final payments remain idempotent and block reversal after partial collection',async()=>{
     const reduction=await req('POST',`${branchBase}/billing/${billingId}/charge-adjustments`,'admin',{target_type:'service_fee',catalog_service_id:serviceId,amount:10,reason:'Synthetic final authorized courtesy'});expectStatus(reduction,200)
     const [[b]]=await db.query('SELECT version,total_amount FROM billing_records WHERE id=?',[billingId]);assert.equal(Number(b.total_amount),390)
     expectStatus(await req('POST',`/api/staff/billing/${billingId}/finalize`,'staff',{expected_version:b.version}),200)
     const partial={payment_method:'cash',payment_amount:100,amount_received:100,idempotency_key:'qa-partial-'+billingId}
     const first=await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',partial);expectStatus(first,200);assert.equal(first.data.status,'partially_paid');assert.equal(Number(first.data.balance_amount),290)
     const denied=await req('POST',`${branchBase}/billing/${billingId}/charge-adjustments/${reduction.data.id}/reverse`,'admin',{reason:'Synthetic forbidden paid reversal'});expectStatus(denied,409);assert.equal(denied.data.code,'BILL_LOCKED')
     expectStatus(await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',partial),200)
     const final={payment_method:'cash',payment_amount:290,amount_received:300,idempotency_key:'qa-final-'+billingId}
     const paid=await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',final);expectStatus(paid,200);assert.equal(paid.data.status,'paid');assert.ok(paid.data.payments[0].receipt_number)
     expectStatus(await req('POST',`/api/staff/billing/${billingId}/pay`,'staff',final),200)
     const [[c]]=await db.query('SELECT COUNT(*) AS n,SUM(amount) AS amount FROM billing_payments WHERE billing_id=?',[billingId]);assert.equal(c.n,2);assert.equal(Number(c.amount),390)
    })
    await check('Patient history contains the same paid bill; another patient cannot read it',async()=>{const r=await req('GET',`/api/patient/billing/history/${billingId}`,'patient');expectStatus(r,200);assert.equal(Number(r.data.id||r.data.bill?.id),billingId);assert.equal(r.data.status||r.data.bill?.status,'paid');const current=cookies.patient;cookies.patient='patient_token='+await makeSessionToken('patient',2);try{expectStatus(await req('GET',`/api/patient/billing/history/${billingId}`,'patient'),404)}finally{cookies.patient=current}})
   }
  }
  await check('Real Super Admin editor previews, saves, publishes and restores without changing the public draft prematurely',async()=>{
   const initial=await req('GET','/api/admin/landing-page','superadmin');expectStatus(initial,200)
   const heading='Synthetic published contact '+unique,second='Synthetic second contact '+unique
   await withPage('superadmin',async(page,expect)=>{
    page.setDefaultTimeout(12000)
    await page.goto(base+'/superadmin/landingpage');await page.getByRole('button',{name:'Contact',exact:true}).click()
    await page.getByLabel('Contact Heading',{exact:true}).fill(heading)
    await expect(page.frameLocator('iframe[title="Mobile live draft preview"]').first().locator('body')).toContainText(heading)
    for(const width of [1440,900,390]){
     await page.setViewportSize({width,height:1000})
     const boxes=await Promise.all(['A. Contact Information','B. Google Maps','C. Call to Action'].map(name=>page.getByRole('heading',{name,exact:true}).boundingBox()))
     assert.ok(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[2].y)
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))
     await page.screenshot({path:path.resolve(__dirname,`browser-artifacts/landing-editor-${width}.png`),fullPage:true})
    }
    await page.getByRole('button',{name:'Preview Website',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Full website preview'})
    await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Desktop preview',exact:true}).click();await expect(dialog.frameLocator('iframe').locator('body')).toContainText(heading)
    await dialog.getByRole('button',{name:'Mobile preview',exact:true}).click();await expect(dialog.frameLocator('iframe').locator('body')).toContainText(heading)
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Private draft saved'})).toBeVisible()
    assert.equal((await req('GET','/api/auth/landing-page')).data.content.contact.heading,initial.data.published_content.contact.heading)
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish Changes',exact:true}).click();await expect.poll(async()=>(await req('GET','/api/auth/landing-page')).data.content.contact.heading).toBe(heading)
    await page.getByLabel('Contact Heading',{exact:true}).fill(second);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish Changes',exact:true}).click();await expect.poll(async()=>(await req('GET','/api/auth/landing-page')).data.content.contact.heading).toBe(second)
    const latest=await req('GET','/api/admin/landing-page','superadmin');assert.ok(latest.data.history.length)
    await page.getByLabel('Previous published versions').selectOption(latest.data.history[0].id);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore Draft',exact:true}).click();await expect(page.getByLabel('Contact Heading',{exact:true})).toHaveValue(heading)
    assert.equal((await req('GET','/api/auth/landing-page')).data.content.contact.heading,second)
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Publish Changes',exact:true}).click();await expect.poll(async()=>(await req('GET','/api/auth/landing-page')).data.content.contact.heading).toBe(heading)
    await page.goto(base+'/');await expect(page.getByText(heading,{exact:true})).toBeVisible()
   })
   expectStatus(await req('POST','/api/admin/landing-page/draft','superadmin',{content:initial.data.content,revision:initial.data.revision}),409)
  })
  await check('Patient logout invalidates the current session',async()=>{expectStatus(await req('POST','/api/patient/logout','patient',{}),200);expectStatus(await req('GET','/api/patient/appointments','patient'),401)})
 }finally{
  if(policyChanged){if(savedPolicy)await db.query('UPDATE branch_booking_settings SET online_min_lead_minutes=?,pending_confirmation_cutoff_minutes=? WHERE branch_id=1',[savedPolicy.online_min_lead_minutes,savedPolicy.pending_confirmation_cutoff_minutes]);else await db.query('DELETE FROM branch_booking_settings WHERE branch_id=1')}
  fs.writeFileSync(path.resolve(__dirname,'clinical-workflow-results.json'),JSON.stringify({results,executions,isolatedDatabase:true,providerDeliveryTested:false,adminMfaDeliveryTested:false,sameDayPolicyOverride:'Local process and synthetic branch 1 only',productionMutations:0},null,2))
  console.log(JSON.stringify({cases:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length}))
  await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await db.end();if(results.some(r=>r.status==='FAIL'))process.exitCode=1
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
