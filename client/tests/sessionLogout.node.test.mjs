import test from 'node:test'
import assert from 'node:assert/strict'
import { logoutRoleSession } from '../src/utils/sessionLogout.mjs'
test('logout sends exactly one request to the chosen role portal',async()=>{
  const original=globalThis.fetch,calls=[]
  try{
    globalThis.fetch=async(path,options)=>{calls.push([path,options.method,options.credentials]);return new Response('{}',{status:200})}
    for(const role of ['patient','doctor','staff','admin','superadmin'])await logoutRoleSession(role)
    assert.deepEqual(calls.map(v=>v[0]),['/api/patient/logout','/api/doctor/logout','/api/staff/logout','/api/admin/logout','/api/admin/logout?portal=superadmin'])
    assert.ok(calls.every(v=>v[1]==='POST'&&v[2]==='include'))
  }finally{globalThis.fetch=original}
})
test('logout rejects HTTP and network failures before local identity can be cleared',async()=>{
  const original=globalThis.fetch
  try{
    globalThis.fetch=async()=>new Response('{}',{status:503})
    await assert.rejects(logoutRoleSession('doctor'),/confirm sign out/)
    globalThis.fetch=async()=>{throw new Error('synthetic network failure')}
    await assert.rejects(logoutRoleSession('patient'),/network failure/)
  }finally{globalThis.fetch=original}
})
