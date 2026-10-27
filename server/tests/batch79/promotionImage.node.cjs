const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const source=fs.readFileSync(path.join(__dirname,'../../routers/branchPromotions.js'),'utf8')
const routes=new Map(),verified=[]
const cloud={
 verifyUploadSecurityToken:(token,contract)=>{
   verified.push(contract)
   if(token!=='approved-token')throw Object.assign(new Error('Approval token invalid'),{statusCode:400})
   if(contract.context_type!=='promotion'||contract.context_id!==1)throw new Error('Cross-branch/image-context error')
   return {url:'https://res.cloudinary.com/demo/image/upload/approved.jpg',asset_id:'asset-11'}
 },
 getPerceptionPointScanStatus:async()=>({status:'approved'}),
 issueAcceptedUploadToken:()=> 'approved-token',
}
const writes=[], fakeDb={getConnection:async()=>({
 beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release:()=>{},
 query:async(sql,args)=>{writes.push([sql,args]);if(sql.includes('SELECT id FROM billing_service_catalog'))return [[{id:7}]];if(sql.startsWith('INSERT INTO clinic_promotions'))return [{insertId:19}];return [[],[]]}
})}
const stubs={
 '../db/connect':fakeDb,'../utils/audit':{writeAuditLog:async()=>{}},
 '../utils/notifications':{createNotification:async()=>{}},
 '../utils/cloudinarySecurity':cloud,
 '../utils/clinicEvents':{broadcastClinicChange:()=>{}},
 express:{raw:()=> (req,res,next)=>next()},
}
const moduleObj={exports:{}}
vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{console})(key=>{if(key in stubs)return stubs[key];throw Error('Unexpected require: '+key)},moduleObj,moduleObj.exports)
const router={get:(route,...handlers)=>routes.set('GET '+route,handlers.at(-1)),post:(route,...handlers)=>routes.set('POST '+route,handlers.at(-1)),put:(route,...handlers)=>routes.set('PUT '+route,handlers.at(-1)),delete:(route,...handlers)=>routes.set('DELETE '+route,handlers.at(-1))}
moduleObj.exports.registerBranchPromotions(router,{requireSuper:(req,res,next)=>next(),branchContext:(req,res,next)=>next(),requirePermission:()=> (req,res,next)=>next()})
const req=({imageUrl,token})=>({branchId:1,user:{id:3},adminContext:{account_role:'admin'},ip:'127.0.0.1',params:{},body:{title:'Skin care',description:'Details',badge_text:'Offer',starts_on:'2026-11-01',ends_on:'2026-11-30',service_ids:[7],is_active:true,show_on_dashboard:true,image_url:imageUrl,image_token:token,featured_order:1}})
const res=()=>({statusCode:200,body:null,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}})
test('unsigned custom promotion image URL is rejected before insert',async()=>{
 const response=res();await routes.get('POST /my/legacy/promotions')(req({imageUrl:'https://attacker.example/img.png'}),response)
 assert.equal(response.statusCode,400);assert.match(response.body.message,/approve/i)
 assert.equal(writes.filter(x=>x[0].startsWith('INSERT INTO clinic_promotions')).length,0)
})
test('approved image binds promotion, actor and current branch and saves only verified asset',async()=>{
 const response=res();await routes.get('POST /my/legacy/promotions')(req({imageUrl:'https://res.cloudinary.com/demo/image/upload/approved.jpg',token:'approved-token'}),response)
 assert.equal(response.statusCode,200);assert.equal(response.body.id,19)
 assert.ok(verified.some(c=>c.context_type==='promotion'&&c.context_id===1&&c.user_id===3&&c.scan_status==='approved'))
 const insert=writes.find(x=>x[0].startsWith('INSERT INTO clinic_promotions'))
 assert.equal(insert[1].at(-3),'https://res.cloudinary.com/demo/image/upload/approved.jpg')
 assert.equal(insert[1].at(-2),'asset-11')
})
test('invalid featured order is rejected',()=>{
 assert.match(moduleObj.exports.validate({...req({}).body,featured_order:-1}),/Featured order/)
 assert.equal(moduleObj.exports.validate({...req({}).body,featured_order:2}),null)
})

