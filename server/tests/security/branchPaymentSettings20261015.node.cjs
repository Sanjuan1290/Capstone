const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const target=require.resolve('../../routers/branchPaymentSettingsWrites')
function load({db,verify}={}){
 const loadOriginal=Module._load
 const mocks={
  'express':{raw:()=>((req,res,next)=>next())},
  '../db/connect':db||{query:async()=>[[]]},
  '../controllers/admin.controller':{},
  '../utils/cloudinarySecurity':{verifyUploadSecurityToken:verify||(()=>{throw Error('Unexpected upload verification')})},
  '../utils/audit':{writeAuditLog:async()=>{}},
  '../utils/settingsValidation':{normalizeOptionalImageUrl:v=>String(v||'').trim()||null},
 }
 try{
  Module._load=function(name,parent,isMain){if(parent?.filename===target&&Object.hasOwn(mocks,name))return mocks[name];return loadOriginal.apply(this,arguments)}
  delete require.cache[target];return require(target)
 }finally{Module._load=loadOriginal;delete require.cache[target]}
}
function resp(){return {statusCode:200,body:null,status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}}
const req=(branchId=2,body={})=>({branchId,user:{id:7},adminContext:{account_role:'admin'},ip:'127.0.0.1',body})
const settings={cash_enabled:true,gcash_enabled:false,maya_enabled:false,bank_transfer_enabled:false}
test('discount proof cannot access an ID owned by another physical branch',async()=>{
 let sqlCalled=false
 const {branchBillForProof}=load({db:{query:async(sql,params)=>{sqlCalled=true;assert.match(sql,/id=\? AND branch_id=\?/);assert.deepEqual(params,[45,2]);return [[]]}}})
 const r=resp();let next=false
 await branchBillForProof({...req(),query:{billing_id:'45'}},r,()=>{next=true})
 assert.equal(sqlCalled,true);assert.equal(r.statusCode,404);assert.equal(next,false)
})
test('branch payment settings update uses only its own row and a scoped audit',async()=>{
 const queries=[],audits=[]
 const connection={beginTransaction:async()=>{},query:async(sql,params)=>{
  queries.push([sql,params])
  if(/FROM branch_payment_settings .*FOR UPDATE/.test(sql))return [[{branch_id:2,cash_enabled:1}]]
  return [{affectedRows:1}]
 },commit:async()=>{},rollback:async()=>{throw Error('Should not rollback')},release:()=>{}}
 const mod=load({db:{getConnection:async()=>connection,query:async(sql,params)=>{assert.match(sql,/branch_id=\?/);assert.deepEqual(params,[2]);return [[{cash_enabled:1,branch_id:2}]]}}})
 const r=resp();await mod.save(req(2,settings),r)
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,{cash_enabled:1,branch_id:2})
 assert.equal(queries[0][1][0],2)
 assert.match(queries[1][0],/INSERT INTO branch_payment_settings/)
 assert.equal(queries[1][1][0],2)
 assert.equal(queries[1][1].at(-1),7)
})
test('new manual GCash/Maya QR setup is rejected before writing to database',async()=>{
 let databaseTouched=false
 const mod=load({db:{getConnection:()=>{databaseTouched=true;throw Error('No connection allowed for retired method')}}})
 const r=resp()
 await mod.save(req(2,{...settings,gcash_enabled:true,gcash_qr_url:'https://example.test/qr.png'}),r)
 assert.equal(databaseTouched,false)
 assert.equal(r.statusCode,400)
 assert.equal(r.body.code,'RETIRED_PAYMENT_METHOD')
})
test('unsafe payment QR URL rejected before database write',async()=>{
 const mod=load({db:{getConnection:()=>{throw Error('Unexpected DB access')}}})
 const r=resp();await mod.save(req(2,{...settings,gcash_qr_url:'http://nonsecure.test/qr.png'}),r)
 assert.equal(r.statusCode,400);assert.equal(r.body.code,'INVALID_IMAGE_URL')
})

