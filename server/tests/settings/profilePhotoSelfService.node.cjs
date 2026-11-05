const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const path=require('node:path')
const file=require.resolve('../../controllers/common.controller.js')
let changed=[]
const oldLoad=Module._load
Module._load=function(name,parent,...rest){
 if(parent?.filename===file){
   if(name==='../utils/accountSettings') return {getSettings:async()=>({}),updateSettings:async(role,id,payload)=>{changed.push({role,id,payload});return {id,profile_image_url:payload.profile_image_url}}}
   if(name==='../utils/audit')return {writeAuditLog:async()=>{}}
   return {}
 }
 return oldLoad.call(this,name,parent,...rest)
}
let ctl
try{delete require.cache[file];ctl=require(file)}finally{Module._load=oldLoad}
const response=()=>({statusCode:200,json(v){this.body=v;return this},status(n){this.statusCode=n;return this}})
const req=(role,url)=>({user:{role,id:7},body:{profile_image_url:url},ip:'127.0.0.1'})
test('photo upload changes only signed-in account and accepts configured Cloudinary image URL',async()=>{
 const prior=process.env.CLOUDINARY_CLOUD_NAME;process.env.CLOUDINARY_CLOUD_NAME='clinic-demo'
 changed=[]
 try{
  const res=response();await ctl.saveMyProfilePhoto(req('doctor','https://res.cloudinary.com/clinic-demo/image/upload/v42/own.jpg'),res)
  assert.equal(res.statusCode,200);assert.equal(changed.length,1)
  assert.deepEqual(changed[0],{role:'doctor',id:7,payload:{profile_image_url:'https://res.cloudinary.com/clinic-demo/image/upload/v42/own.jpg'}})
  const invalid=response();await ctl.saveMyProfilePhoto(req('doctor','https://attacker.test/photo.png'),invalid)
  assert.equal(invalid.statusCode,400);assert.equal(changed.length,1)
 }finally{if(prior===undefined)delete process.env.CLOUDINARY_CLOUD_NAME;else process.env.CLOUDINARY_CLOUD_NAME=prior}
})
test('removal clears only profile photo and returns default avatar state',async()=>{
 changed=[];const res=response();await ctl.removeMyProfilePhoto(req('patient','not-used'),res)
 assert.equal(res.statusCode,200);assert.equal(res.body.profile_image_url,null)
 assert.deepEqual(changed,[{role:'patient',id:7,payload:{profile_image_url:null}}])
})
