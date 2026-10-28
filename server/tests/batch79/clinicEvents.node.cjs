const test=require('node:test'),assert=require('node:assert/strict'),EventEmitter=require('node:events')
const {sseClients,registerClient}=require('../../utils/sse')
const {broadcastClinicChange,afterSuccessfulMutation}=require('../../utils/clinicEvents')
test('branch events reach own role clients and privileged superadmin, never branch B or patients',()=>{
 const calls=(name)=>({writableEnded:false,write:s=>name.push(JSON.parse(s.slice(6).trim()))})
 const a=[],b=[],superadmin=[],patient=[]
 const cleanup=[registerClient('admin',1,calls(a),{branchId:1}),registerClient('staff',3,calls(b),{branchId:2}),registerClient('superadmin',5,calls(superadmin)),registerClient('patient',8,calls(patient))]
 assert.equal(broadcastClinicChange('service.updated',{branchId:1,id:17}),2)
 assert.equal(a[0].event,'service.updated');assert.deepEqual(a[0].data,{branch_id:1,id:17})
 assert.equal(superadmin[0].event,'service.updated');assert.equal(b.length,0);assert.equal(patient.length,0)
 cleanup.forEach(fn=>fn());assert.equal(sseClients.size,0)
})
test('unspecified and invalid branches or topics fail closed',()=>{
 assert.equal(broadcastClinicChange('service.updated',{}),0)
 assert.equal(broadcastClinicChange('imaginary.updated',{branchId:1}),0)
})
test('mutation events only emit after successful response, not rejected writes',()=>{
 const events=[];const client={writableEnded:false,write:s=>events.push(JSON.parse(s.slice(6).trim()))};const off=registerClient('admin',10,client,{branchId:1})
 const done=(status)=>{const res=new EventEmitter();res.statusCode=status;let called=false;afterSuccessfulMutation('inventory.updated')({branchId:1,params:{}},res,()=>called=true);assert.ok(called);res.emit('finish')}
 done(400);done(500);assert.equal(events.length,0);done(201);assert.equal(events.length,1);off()
})
