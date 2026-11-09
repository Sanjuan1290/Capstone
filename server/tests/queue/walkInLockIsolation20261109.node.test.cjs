'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {addWalkInVisit}=require('../../utils/walkIn')

test('simultaneous walk-in requests release only their own patient lock and never create a process global',async()=>{
 let release
 const gate=new Promise(resolve=>{release=resolve})
 const makeExecutor=()=>{
  const released=[]
  return {released,query:async(sql,args)=>{
   if(sql.includes('GET_LOCK')){await gate;return [[{acquired:0}]]}
   if(sql.includes('RELEASE_LOCK')){released.push(args[0]);return [[{released:0}]]}
   throw new Error('No application writes should happen when acquiring the lock fails')
  }}
 }
 const first=makeExecutor(),second=makeExecutor()
 const one=addWalkInVisit({patientId:11,branchId:1,clinicType:'medical'},first)
 const two=addWalkInVisit({patientId:22,branchId:2,clinicType:'medical'},second)
 release()
 try{
  const results=await Promise.allSettled([one,two])
  assert.ok(results.every(result=>result.status==='rejected'&&result.reason.code==='QUEUE_BUSY'))
  assert.deepEqual(first.released,['queue:patient:1:11'])
  assert.deepEqual(second.released,['queue:patient:2:22'])
  assert.equal(globalThis.patientLockKey,undefined)
 }finally{delete globalThis.patientLockKey}
})
