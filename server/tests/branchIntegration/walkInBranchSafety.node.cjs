const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')

const moduleFile = require.resolve('../../utils/walkIn')
const actualLoad = Module._load
const traces = []
const fakeDb = { getConnection: async () => fakeConnection }
let fakeConnection
const events=[]
const fakeAudit = { writeAuditLog: async (entry) => { traces.push(['AUDIT',entry.branchId]) } }
const fakeAvailability = { buildWalkInDoctorAvailability: async ({ branchId }) => {
  traces.push(['AVAILABILITY',branchId]);return { doctors: [{id:6,full_name:'Owned doctor',available_now:true}] }
} }
const fakeSse = { broadcast: (...args) => events.push(args) }
Module._load = function(request,parent,isMain){
 if (parent?.filename === moduleFile) {
  if (request === '../db/connect') return fakeDb
  if (request === './audit') return fakeAudit
  if (request === './doctorAvailabilitySummary') return fakeAvailability
  if (request === './sse') return fakeSse
 }
 return actualLoad.apply(this,arguments)
}
let walkIn
try { delete require.cache[moduleFile]; walkIn = require(moduleFile) } finally {Module._load=actualLoad}

test('walk-in precheck rejects unknown branch and filters queue and appointments', async()=>{
 const calls=[]
 const exec = {query:async(sql,args)=>{
   calls.push({sql,args})
   if(sql.includes('FROM queue')) return [[]]
   if(sql.includes('FROM appointments'))return [[]]
   throw new Error(`Unexpected query: ${sql}`)
 }}
 await assert.rejects(walkIn.getWalkInPrecheck(11,null,exec),/Verified branch required/)
 const output=await walkIn.getWalkInPrecheck(11,22,exec)
 assert.equal(output.active_queue,null)
 assert.equal(calls.length,2)
 for(const {sql,args} of calls){assert.match(sql,/branch_id\s*=\s*\?/);assert.ok(args.includes(22))}
 assert.deepEqual(calls[0].args.slice(0,2),[11,22])
 assert.deepEqual(calls[1].args.slice(0,2),[11,22])
})

test('new walk-in writes its appointment, queue number and audit to the verified branch',async()=>{
 traces.length=0;events.length=0
 fakeConnection={
  beginTransaction:async()=>traces.push(['BEGIN']),
  commit:async()=>traces.push(['COMMIT']),
  rollback:async()=>traces.push(['ROLLBACK']),
  release:()=>traces.push(['RELEASE']),
  query:async(sql,args)=>{
   traces.push(['SQL',sql,args])
   if(sql.includes('FROM queue q')||sql.includes('FROM appointments a')||sql.includes('FROM queue WHERE appointment_id'))return [[]]
   if(sql.startsWith('INSERT INTO appointments'))return [{insertId:71}]
   if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]]
   if(sql.startsWith('SELECT COALESCE(MAX(queue_number)'))return [[{maxQ:4}]]
   if(sql.startsWith('INSERT INTO queue'))return [{insertId:91}]
   if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{ok:1}]]
   throw new Error(`Unexpected query: ${sql}`)
  }
 }
 const result=await walkIn.addWalkInVisit({patientId:8,patientName:'Patient',doctorId:6,clinicType:'medical',actorRole:'staff',actorId:3,branchId:22})
 assert.equal(result.status,201)
 assert.equal(result.body.queue_number,5)
 for(const prefix of ['INSERT INTO appointments','INSERT INTO queue','SELECT COALESCE(MAX(queue_number)']){
  const [,sql,args]=traces.find(t=>t[0]==='SQL'&&t[1].startsWith(prefix))||[]
  assert.ok(sql,`Missing ${prefix}`)
  assert.match(sql,/branch_id/)
  assert.ok(args.includes(22))
 }
 assert.ok(traces.find(t=>t[0]==='AVAILABILITY'&&t[1]===22))
 assert.ok(traces.find(t=>t[0]==='AUDIT'&&t[1]===22))
 // Both advisory locks must be acquired before writes and released after COMMIT.
 const patientLock = traces.findIndex(t=>t[0]==='SQL'&&t[1].startsWith('SELECT GET_LOCK')&&String(t[2]?.[0]).includes('queue:patient:'))
 const precheckIndex = traces.findIndex(t=>t[0]==='SQL'&&t[1].includes('FROM queue q'))
 const commitIndex = traces.findIndex(t=>t[0]==='COMMIT')
 const queueRelease = traces.findIndex(t=>t[0]==='SQL'&&t[1].startsWith('SELECT RELEASE_LOCK')&&String(t[2]?.[0]).startsWith('queue:22:'))
 const patientRelease = traces.findIndex(t=>t[0]==='SQL'&&t[1].startsWith('SELECT RELEASE_LOCK')&&String(t[2]?.[0]).includes('queue:patient:'))
 assert.ok(patientLock>=0 && patientLock<precheckIndex)
 assert.ok(queueRelease>commitIndex && patientRelease>commitIndex)
 assert.equal(events.length,2)
 assert.ok(events.every(call=>call[3]?.branchId===22))
 assert.deepEqual(traces.filter(t=>t[0]==='BEGIN'||t[0]==='COMMIT'||t[0]==='ROLLBACK').map(t=>t[0]),['BEGIN','COMMIT'])
})

test('already checked-in scheduled appointment cannot get a second queue entry', async()=>{
 traces.length=0;events.length=0
 const today=require('../../utils/date').getTodayDateOnly()
 fakeConnection={
  beginTransaction:async()=>traces.push(['BEGIN']),
  commit:async()=>traces.push(['COMMIT']),
  rollback:async()=>traces.push(['ROLLBACK']),
  release:()=>traces.push(['RELEASE']),
  query:async(sql,args)=>{
   traces.push(['SQL',sql,args])
   if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]]
   if(sql.startsWith('SELECT RELEASE_LOCK'))return [[{ok:1}]]
   if(sql.includes('FROM queue q'))return [[]]
   if(sql.includes('FROM appointments a'))return [[{id:71,status:'confirmed',clinic_type:'medical',appointment_date:today,appointment_time:'2:30 PM',doctor_id:6,doctor_name:'Owned doctor'}]]
   if(sql.startsWith('UPDATE appointments'))return [{affectedRows:1}]
   if(sql.startsWith('SELECT id FROM queue WHERE appointment_id'))return [[{id:91}]]
   throw Error(`Unexpected query ${sql}`)
  },
 }
 const result=await walkIn.addWalkInVisit({patientId:8,doctorId:6,clinicType:'medical',checkInAppointmentId:71,actorRole:'staff',actorId:3,branchId:22})
 assert.equal(result.status,409)
 assert.equal(result.body.code,'APPOINTMENT_ALREADY_CHECKED_IN')
 assert.ok(traces.some(t=>t[0]==='ROLLBACK'))
 assert.ok(!traces.some(t=>t[0]==='COMMIT'))
 assert.equal(events.length,0)
})

test('Staff delegated reports, audits and core setup use only branch-aware read handlers',()=>{
 const router=fs.readFileSync(path.resolve(__dirname,'../../routers/staff.router.js'),'utf8')
 for(const fragment of ['adminCtrl.getReports','adminCtrl.getAuditLogs','adminCtrl.getAuditArchiveBatches','adminCtrl.getAuditArchiveDetail','adminCtrl.getSystemSetup']){
  assert.doesNotMatch(router,new RegExp(`, ${fragment.replace('.','\\.')}\\)`),`Legacy unscoped handler: ${fragment}`)
 }
 for(const handler of ['readBranchReport','readBranchAuditPage','readBranchArchives','readBranchArchiveDetail','readSystemSetup','saveVisitReason','saveCancellation','saveCategory'])assert.match(router,new RegExp(handler))
})
