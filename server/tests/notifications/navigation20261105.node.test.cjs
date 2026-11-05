const test=require('node:test'),assert=require('node:assert/strict')
const {notificationDestination}=require('../../utils/notificationDestination')
function setup({role='admin',branch=1,reference='billing_record',record={},notification={},deleted=false}={}){
 const n={id:4,target_role:role,target_user_id:8,branch_id:branch,reference_type:reference,reference_id:6,...notification},calls=[]
 const row={id:6,branch_id:branch,patient_id:8,doctor_id:8,status:'confirmed',appointment_date:'2026-11-05',...record}
 const executor={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('FROM notifications'))return [[...(args[1]===n.target_role&&(n.target_user_id===null||args[2]===n.target_user_id)&&(args.length===3||Number(args[3])===n.branch_id)?[n]:[])]];return [[...(!deleted&&(args.length===1||Number(args[1])===row.branch_id)?[row]:[])]]}}
 return {executor,calls}
}
const resolve=(fixture,options={})=>notificationDestination({id:4,role:'admin',userId:8,branchId:1,permissions:['billing','appointments','system_setup','inventory'],...options},fixture.executor)
test('legacy billing links are replaced with authenticated role and correct branch paths',async()=>{
 assert.equal((await resolve(setup({notification:{link:'/admin/checkout/6'}}))).path,'/admin/billing/checkout/6')
 assert.equal((await resolve(setup({branch:3}),{superadmin:true,branchId:2})).path,'/superadmin/branches/3/billing/checkout/6')
 assert.equal((await resolve(setup({role:'staff'}),{role:'staff',permissions:['checkout']})).path,'/staff/checkout/6')
 assert.equal((await resolve(setup({role:'patient'}),{role:'patient'})).path,'/patient/history?bill_id=6')
})
test('appointment events open appointment details for every role and patient history when completed',async()=>{
 for(const role of ['admin','staff','doctor','patient']){const result=await resolve(setup({role,reference:'appointment'}),{role});assert.match(result.path,new RegExp(`^/${role}/appointments\\?appointment_id=6`))}
 assert.equal((await resolve(setup({role:'patient',reference:'appointment',record:{status:'completed'}}),{role:'patient'})).path,'/patient/history?appointment_id=6')
})
test('expired offers, deleted records, missing references and malicious URLs give clear errors',async()=>{
 await assert.rejects(()=>resolve(setup({deleted:true})),{statusCode:410})
 await assert.rejects(()=>resolve(setup({reference:'unknown',notification:{link:'https://bad.example/'}})),{statusCode:410})
 await assert.rejects(()=>resolve(setup({role:'patient',reference:'promotion',record:{is_active:0,starts_on:'2020-01-01',ends_on:'2099-01-01'}}),{role:'patient'}),{statusCode:410})
 assert.match((await resolve(setup({notification:{link:'javascript:alert(1)'}}))).path,/^\/admin\/billing\/checkout\//)
})
test('destinations enforce branch ownership, module permission, and patient/doctor ownership',async()=>{
 await assert.rejects(()=>resolve(setup({branch:2})),{statusCode:404})
 await assert.rejects(()=>resolve(setup(),{permissions:[]}),{statusCode:403})
 await assert.rejects(()=>resolve(setup({role:'staff'}),{role:'staff',permissions:[]}),{statusCode:403})
 await assert.rejects(()=>resolve(setup({role:'patient',record:{patient_id:99}}),{role:'patient'}),{statusCode:403})
 await assert.rejects(()=>resolve(setup({role:'doctor',reference:'appointment',record:{doctor_id:99}}),{role:'doctor'}),{statusCode:403})
})
test('active promotions and published announcements navigate to specific records without changing read state',async()=>{
 const fixture=setup({role:'patient',reference:'promotion',record:{is_active:1,starts_on:'2020-01-01',ends_on:'2099-12-31'}})
 assert.equal((await resolve(fixture,{role:'patient'})).path,'/patient/offers?branch_id=1&promotion_id=6')
 assert.equal(fixture.calls.some(([sql])=>!sql.startsWith('SELECT')),false)
 assert.equal((await resolve(setup({role:'patient',reference:'announcement',record:{status:'published',slug:'clinic-news'}}),{role:'patient'})).path,'/news/1/clinic-news')
})

test('Branch Admin promotion navigation uses the same setup permission as its destination',async()=>{
 const f=setup({reference:'promotion'})
 assert.equal((await resolve(f,{permissions:['system_setup']})).path,'/admin/announcements?promotion_id=6')
 await assert.rejects(()=>resolve(f,{permissions:['billing']}),{statusCode:403})
})
test('retired doctor stock destinations show a message instead of navigating to a missing route',async()=>{
 await assert.rejects(()=>resolve(setup({role:'doctor',reference:'supply_request'}),{role:'doctor'}),{statusCode:410})
})


test('billing-only Staff notification opens permitted history without gaining checkout access',async()=>{
 const f=setup({role:'staff'})
 assert.equal((await resolve(f,{role:'staff',permissions:['billing']})).path,'/staff/billing/history/6')
 await assert.rejects(()=>resolve(f,{role:'staff',permissions:[]}),{statusCode:403})
})

test('legacy global notifications retain actual record branch and patient ownership checks',async()=>{
 const f=setup({branch:0,record:{branch_id:3}})
 assert.equal((await resolve(f,{superadmin:true})).path,'/superadmin/branches/3/billing/checkout/6')
 const patient=setup({role:'patient',branch:0,record:{branch_id:3,patient_id:99}})
 await assert.rejects(()=>resolve(patient,{role:'patient'}),{statusCode:403})
})

test('Staff marketing notices never resolve to a missing route',async()=>{
 await assert.rejects(()=>resolve(setup({role:'staff',reference:'promotion'}),{role:'staff',permissions:['system_setup']}),{statusCode:410})
})
