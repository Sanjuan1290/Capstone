const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function harness(states=['called','waiting']){
 const rows=states.map((status,index)=>({id:index+1,doctor_id:8,branch_id:1,queue_date:'2026-11-13',queue_number:index+1,type:'derma',status,appointment_id:100+index,patient_id:200+index,patient_name:'Synthetic '+index})),audits=[],queries=[]
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},async query(sql,params=[]){
  queries.push({sql,params})
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]]
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]]
  if(sql.includes('WHERE doctor_id=?')){
   assert.deepEqual(Array.from(params).slice(0,3),[8,1,'2026-11-13'])
   const scoped=rows.filter(row=>row.doctor_id===params[0]&&row.branch_id===params[1]&&row.queue_date===params[2])
   const values=sql.includes("status='waiting'")?scoped.filter(row=>row.status==='waiting'&&row.id!==params[3]):scoped.filter(row=>['called','in-progress','in_consultation'].includes(row.status)).sort((a,b)=>(a.status==='in_consultation'?0:1)-(b.status==='in_consultation'?0:1))
   return [values.slice(0,1).map(row=>({...row}))]
  }
  if(sql.includes('WHERE q.id = ?'))return [rows.filter(row=>row.id===params[0]&&row.branch_id===params[1]).map(row=>({...row}))]
  if(sql.startsWith('UPDATE queue SET')){const row=rows.find(row=>row.id===params.at(-2)&&row.branch_id===params.at(-1));row.status=params[0];return [{affectedRows:1}]}
  throw Error('Unexpected queue SQL '+sql)
 }}
 const module={exports:{}},deps={'../db/connect':{getConnection:async()=>conn},'./sse':{broadcast(){}},'./notifications':{createNotification:async()=>{}},'./audit':{writeAuditLog:async row=>audits.push(row)},'./date':{getTodayDateOnly:()=> '2026-11-13'}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../../utils/queueWorkflow'),'utf8'),{module,require:key=>deps[key]})
 const call=extra=>module.exports.callNextQueuePatient({doctorId:8,branchId:1,actorRole:'doctor',actorId:8,...extra})
 return {rows,audits,queries,call}
}
test('Call Next reports the called queue number without changing or completing it',async()=>{
 const h=harness(),result=await h.call()
 assert.equal(result.alreadyActive,true);assert.equal(result.nextPatient.queue_number,1);assert.equal(result.nextPatient.type,'derma')
 assert.match(result.message,/already been called/);assert.equal(h.audits.length,0)
 assert.deepEqual(h.rows.map(row=>row.status),['called','waiting'])
})
test('patient not present returns only that called patient and calls the next different waiting patient',async()=>{
 const h=harness(),result=await h.call({returnCalledQueueId:1})
 assert.equal(result.returnedPatient.id,1);assert.equal(result.nextPatient.id,2)
 assert.deepEqual(h.rows.map(row=>row.status),['waiting','called'])
 assert.deepEqual(h.audits.map(row=>row.action),['queue.waiting','queue.called'])
 assert.equal(h.audits[0].newValues.reason_code,'patient_not_present')
 assert.ok(h.audits.every(row=>row.userRole==='doctor'&&row.userId===8&&row.branchId===1))
 assert.ok(!h.queries.some(row=>/UPDATE appointments|status='done'/.test(row.sql)))
})
test('no other waiting patient leaves the unanswered patient safely waiting',async()=>{
 const h=harness(['called']),result=await h.call({returnCalledQueueId:1})
 assert.equal(result.nextPatient,null);assert.equal(h.rows[0].status,'waiting')
 assert.match(result.message,/no other waiting patients/i)
})
test('active consultation cannot be skipped, returned, or silently completed',async()=>{
 const h=harness(['in_consultation','waiting'])
 const blocked=await h.call();assert.equal(blocked.alreadyActive,true);assert.match(blocked.message,/Complete that visit/)
 await assert.rejects(h.call({returnCalledQueueId:1}),error=>error.statusCode===409&&error.code==='QUEUE_CHANGED')
 assert.equal(h.audits.length,0);assert.equal(h.rows[0].status,'in_consultation')
})
test('stale, foreign and repeated return requests never skip the next called patient',async()=>{
 const h=harness()
 await assert.rejects(h.call({returnCalledQueueId:999}),error=>error.code==='QUEUE_CHANGED')
 await h.call({returnCalledQueueId:1})
 await assert.rejects(h.call({returnCalledQueueId:1}),error=>error.code==='QUEUE_CHANGED')
 assert.deepEqual(h.rows.map(row=>row.status),['waiting','called'])
})
