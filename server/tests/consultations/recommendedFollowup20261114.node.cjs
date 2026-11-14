const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../../utils/consultationFollowups.js'),'utf8')
function harness(prior=null){
 const writes=[],audits=[],conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,args)=>{
  if(sql.startsWith('SELECT c.id'))return [[]]
  if(sql.startsWith('SELECT'))return [[prior].filter(Boolean)]
  writes.push({sql,args});return [{insertId:9}]
 }}
 const module={exports:{}}
 vm.runInNewContext(source,{module,require:name=>name==='./date'?{getTodayDateOnly:()=> '2026-11-14'}:name==='./audit'?{writeAuditLog:async e=>audits.push(e)}:name==='../db/connect'?{getConnection:async()=>conn}:require(name),Date,Number,Error})
 return {...module.exports,writes,audits,conn}
}
test('optional follow-up accepts a real calendar date and sanitizes the note',()=>{
 const h=harness(),row=h.normalizeFollowup({return_date:'2026-11-16',doctor_note:' <b>Return for review</b>\u0000 '})
 assert.equal(row.return_date,'2026-11-16');assert.equal(row.doctor_note,'Return for review')
 assert.equal(h.normalizeFollowup(null).status,'removed')
})
for(const date of ['2026-02-30','2026-13-01','invalid','2026-11-13','2026-11-16T00:00:00Z'])test(`rejects invalid or past new date ${date}`,()=>assert.throws(()=>harness().normalizeFollowup({return_date:date}),{statusCode:400}))
test('an unchanged historical recommendation date may retain an updated note',()=>assert.equal(harness().normalizeFollowup({return_date:'2026-01-01',doctor_note:'Updated'}, {return_date:'2026-01-01'}).doctor_note,'Updated'))
test('rejects overlong and non-text notes',()=>{
 for(const doctor_note of ['x'.repeat(2001),{}])assert.throws(()=>harness().normalizeFollowup({return_date:'2026-11-16',doctor_note}),{statusCode:400})
})
test('saving records revisions and audit but never creates an appointment, bill, queue or notification',async()=>{
 const h=harness();const saved=await h.saveFollowup({consultationId:2,appointment:{id:3,patient_id:4,branch_id:1},doctorId:5,value:{return_date:'2026-11-16',doctor_note:'Review'}},h.conn)
 assert.equal(saved.version,1);assert.equal(h.audits.length,1)
 assert.equal(h.writes.length,2);assert.match(h.writes[0].sql,/INSERT INTO consultation_followups/);assert.match(h.writes[1].sql,/INSERT INTO consultation_followup_revisions/)
})
test('old clients preserve recommendation; removals retain history; stale edits fail',async()=>{
 const prior={id:9,version:2,return_date:'2026-11-16',doctor_note:'Review',status:'active'},h=harness(prior)
 await h.saveFollowup({value:undefined},h.conn);assert.equal(h.writes.length,0)
 await assert.rejects(h.saveFollowup({consultationId:2,value:null,expectedVersion:1},h.conn),{statusCode:409});assert.equal(h.writes.length,0)
 const saved=await h.saveFollowup({consultationId:2,appointment:{id:3,branch_id:1},doctorId:5,value:null,expectedVersion:2},h.conn)
 assert.equal(saved.status,'removed');assert.equal(saved.version,3);assert.equal(h.writes.length,2)
})
test('doctor follow-up updates enforce parent doctor and branch ownership',async()=>{
 const h=harness();let code,body
 await h.updateDoctorFollowup({params:{appointmentId:3},user:{id:7},branchId:2,body:{follow_up:null,expected_version:0}},{status(n){code=n;return this},json(value){body=value}})
 assert.equal(code,404);assert.match(body.message,/not found/);assert.equal(h.writes.length,0)
})
test('booking cannot link another patient’s recommendation',async()=>{
 const h=harness();await assert.rejects(h.lockPatientFollowup(5,99,h.conn),{statusCode:404})
 assert.equal(h.writes.length,0)
})
test('booking rejects a repeated active appointment for the same recommendation',async()=>{
 const h=harness({id:5});await assert.rejects(h.lockPatientFollowup(5,4,h.conn),{statusCode:409})
 assert.equal(h.writes.length,0)
})
test('booking requires a valid recommendation identifier',async()=>{
 const h=harness();for(const id of ['x',-1,0,1.2])await assert.rejects(h.lockPatientFollowup(id,4,h.conn),{statusCode:400})
})
