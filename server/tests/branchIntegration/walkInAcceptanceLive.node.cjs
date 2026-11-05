const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const path=require('node:path')
const fs=require('node:fs')
const root=path.resolve(__dirname,'../..')
const load=(name,mocks)=>{
 const file=require.resolve(path.join(root,name));const prev=Module._load
 Module._load=function(request,parent,...rest){if(parent?.filename===file&&Object.prototype.hasOwnProperty.call(mocks,request))return mocks[request];return prev.call(this,request,parent,...rest)}
 try{delete require.cache[file];return require(file)}finally{Module._load=prev}
}
test('24-hour on-duty doctor accepts walk-ins with no future scheduled slot',async()=>{
 const calls=[]
 const ex={query:async(sql,args)=>{
   calls.push({sql,args});if(sql.includes('FROM doctors'))return [[{id:9,full_name:'Doctor A',clinic_type:'medical',specialty:'General Medicine'}]]
   if(sql.includes('FROM doctor_schedules'))return [[{doctor_id:9,day_of_week:'Friday',start_time:'00:00',end_time:'00:00',is_24_hours:1,is_active:1,spans_next_day:1}]]
   if(sql.includes('FROM doctor_unavailable_dates'))return [[]]
   if(sql.includes('FROM appointments'))return [[]]
   if(sql.includes('FROM doctor_branch_assignments'))return [[{doctor_id:9,accepting_walk_ins:1}]]
   if(sql.includes('FROM queue'))return [[{doctor_id:9,active_queue_count:3}]]
   throw new Error('Unexpected query '+sql)
 }}
 const now=new Date();const date=require('../../utils/date');const {getTodayDateOnly}=date;
 // Schedules need to match the actual clinic weekday, independent of host system clock.
 const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',weekday:'long'}).format(now)
 ex.query=async(sql,args)=>{calls.push({sql,args});if(sql.includes('FROM doctors'))return [[{id:9,full_name:'Doctor A',clinic_type:'medical',specialty:'General Medicine'}]];if(sql.includes('FROM doctor_schedules'))return [[{doctor_id:9,day_of_week:weekday,start_time:'00:00',end_time:'00:00',is_24_hours:1,is_active:1,spans_next_day:1}]];if(sql.includes('FROM doctor_unavailable_dates')||sql.includes('FROM appointments'))return [[]];if(sql.includes('FROM doctor_branch_assignments'))return [[{doctor_id:9,accepting_walk_ins:1}]];if(sql.includes('FROM queue'))return [[{doctor_id:9,active_queue_count:3}]];throw new Error('Unexpected query '+sql)}
 const windows=require('../../utils/scheduleWindows')
 const {buildWalkInDoctorAvailability}=load('utils/doctorAvailabilitySummary.js', {'../db/connect':ex, './scheduleWindows': {...windows,buildSlotsForCalendarDate:()=>[]}})
 const result=await buildWalkInDoctorAvailability({clinicType:'medical',branchId:2},ex)
 assert.equal(result.doctors.length,1);assert.equal(result.doctors[0].available_now,true)
 assert.equal(result.doctors[0].on_duty_now,true)
 assert.equal(result.doctors[0].active_queue_count,3)
 assert.equal(result.doctors[0].next_available_slot,null)
 assert.ok(calls.every(x=>x.args.includes(2) || x.sql.includes('FROM doctor_schedules') || x.sql.includes('FROM appointments') || x.sql.includes('FROM doctor_unavailable_dates')))
})
test('walk-in toggle is branch-bound, audited, and broadcasts only after state change',async()=>{
 const events=[];const writes=[]
 const fake={query:async(sql,args)=>{writes.push({sql,args});if(sql.includes('SELECT accepting_walk_ins'))return [[{accepting_walk_ins:1}]];return [{affectedRows:1}]}}
 const mod=load('utils/walkInAcceptance.js',{'../db/connect':fake,'./clinicEvents':{broadcastClinicChange:(event,arg)=>events.push([event,arg])},'./audit':{writeAuditLog:async()=>{}}})
 await assert.rejects(mod.setWalkInAcceptance({doctorId:2,branchId:3,actorRole:'doctor',actorId:2,accepting:1},fake),/true or false/)
 const state=await mod.setWalkInAcceptance({doctorId:2,branchId:3,actorRole:'doctor',actorId:2,accepting:false},fake)
 assert.equal(state.accepting_walk_ins,false)
 assert.equal(events.length,1);assert.deepEqual(events[0],['schedule.updated',{branchId:3,id:2}])
 assert.deepEqual(writes.at(-1).args,[0,2,3])
 assert.match(writes.at(-1).sql,/doctor_id=\? AND branch_id=\? AND is_active=1/)
})
test('walk-in endpoints and service selection are connected across roles',()=>{
 for(const pathPart of ['routers/doctor.router.js','routers/staff.router.js','routers/branches.router.js']){
   const src=fs.readFileSync(path.join(root,pathPart),'utf8');assert.match(src,/walk-ins\/acceptance/)
 }
 const doc=fs.readFileSync(path.join(root,'controllers/doctor.controller.js'),'utf8');assert.match(doc,/SERVICE_REQUIRED/)
 const consultation=fs.readFileSync(path.join(root,'../client/src/pages/doctorPage/Doctor_Consultation.jsx'),'utf8');
 assert.match(consultation,/Add a service performed/);assert.match(consultation,/Select at least one service actually performed/)
})

test('blocked date without a reason and opted-out doctor remain unselectable',async()=>{
 const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',weekday:'long'}).format(new Date())
 const date=require('../../utils/date').getTodayDateOnly()
 const windows=require('../../utils/scheduleWindows')
 const {buildWalkInDoctorAvailability}=load('utils/doctorAvailabilitySummary.js',{
   '../db/connect':{},'./scheduleWindows':{...windows,buildSlotsForCalendarDate:()=>[]},
 })
 for(const scenario of [{blocked:true,accepting:1,reason:'Doctor is unavailable on this date.'},{blocked:false,accepting:0,reason:'Doctor is not accepting walk-ins.'}]){
   const db={query:async sql=>{
     if(sql.includes('FROM doctors'))return [[{id:9,full_name:'A',clinic_type:'medical'}]]
     if(sql.includes('FROM doctor_schedules'))return [[{doctor_id:9,day_of_week:day,start_time:'00:00',end_time:'00:00',is_24_hours:1,is_active:1,spans_next_day:1}]]
     if(sql.includes('FROM doctor_unavailable_dates'))return [scenario.blocked?[{doctor_id:9,unavailable_date:date,reason:null}]:[]]
     if(sql.includes('FROM appointments'))return [[]]
     if(sql.includes('FROM doctor_branch_assignments'))return [[{doctor_id:9,accepting_walk_ins:scenario.accepting}]]
     if(sql.includes('FROM queue'))return [[]]
     throw new Error('Unexpected '+sql)
   }}
   const output=await buildWalkInDoctorAvailability({clinicType:'medical',branchId:2},db)
   assert.equal(output.doctors[0].available_now,false)
   assert.equal(output.doctors[0].availability_reason,scenario.reason)
 }
})
