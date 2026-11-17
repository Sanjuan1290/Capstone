const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../../utils/consultationFollowups.js'),'utf8')
function harness(prior=null){
 const writes=[],audits=[],conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,args)=>{
  if(sql.startsWith('SELECT c.id'))return [[]]
  if(sql.startsWith('SELECT'))return [[prior].filter(Boolean)]
  writes.push({sql,args});return [{insertId:9}]
 }}
 const module={exports:{}}
 vm.runInNewContext(source,{module,require:name=>name==='./date'?{getTodayDateOnly:()=> '2026-11-14'}:name==='./audit'?{writeAuditLog:async e=>audits.push(e)}:name==='../db/connect'?{getConnection:async()=>conn,query:(...args)=>conn.query(...args)}:require(name),Date,Number,Error})
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
 const h=harness({id:5,return_date:'2026-11-16'});await assert.rejects(h.lockPatientFollowup(5,4,h.conn),{statusCode:409})
 assert.equal(h.writes.length,0)
})
test('booking requires a valid recommendation identifier',async()=>{
 const h=harness();for(const id of ['x',-1,0,1.2])await assert.rejects(h.lockPatientFollowup(id,4,h.conn),{statusCode:400})
})

test('multiple follow-up dates retain individual notes and a full revision snapshot',async()=>{
 const h=harness(),dates=[{return_date:'2026-12-01',doctor_note:'Second visit'},{return_date:'2026-11-20',doctor_note:'<b>First visit</b>'}]
 const saved=await h.saveFollowup({consultationId:2,appointment:{id:3,patient_id:4,branch_id:1},doctorId:5,value:{dates}},h.conn)
 assert.equal(saved.dates.length,2);assert.equal(saved.dates[0].doctor_note,'First visit');assert.equal(saved.dates[1].doctor_note,'Second visit')
 assert.deepEqual(JSON.parse(h.writes[0].args.at(-1)),JSON.parse(h.writes[1].args.at(-1)))
 assert.equal(saved.return_date,'2026-11-20')
})

test('rejects duplicate dates, empty schedules and invalid notes on any selected date',()=>{
 const h=harness(),date={return_date:'2026-11-20',doctor_note:'First visit'}
 for(const dates of [[],[date,date],[date,{return_date:'2026-11-21',doctor_note:{}}]])assert.throws(()=>h.normalizeFollowup({dates}),{statusCode:400})
})

test('booking one follow-up date does not block other dates in the same recommendation',async()=>{
 const h=harness(),dates=[{return_date:'2026-11-20',doctor_note:'First'},{return_date:'2026-12-01',doctor_note:'Second'}]
 const conn={query:async(sql,args)=>sql.includes('FROM consultation_followups f')?[[{id:5,branch_id:2,dates_json:JSON.stringify(dates)}]]:[args[2]==='2026-11-20'?[{id:90}]:[]]}
 await assert.rejects(h.lockPatientFollowup(5,4,conn,{returnDate:'2026-11-20',branchId:2}),{statusCode:409})
 const available=await h.lockPatientFollowup(5,4,conn,{returnDate:'2026-12-01',branchId:2})
 assert.equal(available.return_date,'2026-12-01')
 await assert.rejects(h.lockPatientFollowup(5,4,conn,{returnDate:'2026-12-03',branchId:2}),{statusCode:400})
 await assert.rejects(h.lockPatientFollowup(5,4,conn,{returnDate:'2026-12-01',branchId:99}),{statusCode:400})
})

test('patient recommendations expose every date with its own notes and booking state',async()=>{
 const h=harness(),dates=[{return_date:'2026-11-20',doctor_note:'First'},{return_date:'2026-12-01',doctor_note:'Second'}]
 h.conn.query=async(sql,args)=>{
  assert.equal(args[0],4)
  if(sql.includes('FROM consultation_followups f'))return [[{id:5,branch_id:2,status:'active',dates_json:JSON.stringify(dates)}]]
  return [[{followup_id:5,appointment_id:90,return_date:'2026-11-20'}]]
 }
 let rows;await h.listPatientFollowups({user:{id:4}},{json(value){rows=value}})
 assert.equal(rows.length,2);assert.equal(rows[0].booked_appointment_id,90);assert.equal(rows[1].booked_appointment_id,null)
 assert.equal(rows[1].doctor_note,'Second')
})
