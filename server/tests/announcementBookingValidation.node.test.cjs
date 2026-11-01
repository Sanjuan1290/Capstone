const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
// Extract just the pure validation function; no DB connection needed.
const code=fs.readFileSync(require.resolve('../routers/branchAnnouncements.js'),'utf8')
const start=code.indexOf('const validatePost = body => {'),end=code.indexOf('\nconst uniqueSlug',start)
const ctx={URL,Number,Date,String,Array,Object,Number,console,bad:(message)=>new Error(message),clean:(v,max=255)=>String(v??'').trim().slice(0,max),slug:s=>String(s).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,''),dateTime:()=>null,idOk:n=>Number.isSafeInteger(Number(n))&&Number(n)>0}
const validate=vm.runInNewContext(`${code.slice(start,end)};validatePost`,ctx)
const sample={type:'promotion',title:'Skin Treatment Promo',caption:'Test',body:'Article text',status:'published'}
test('saves the selected branch service booking destination',()=>{
 const row=validate({...sample,cta_url:'/patient/book?branch_id=1&clinic=derma&service_id=30001'})
 assert.equal(row.cta_url,'/patient/book?branch_id=1&clinic=derma&service_id=30001')
 assert.equal(row.promotion_id,null)
})
test('saves linked promotion id instead of silently resetting it',()=>{
 const row=validate({...sample,promotion_id:31,cta_url:'/patient/book?branch_id=1'})
 assert.equal(row.promotion_id,31)
})
test('blocks external or arbitrary links',()=>{
 assert.throws(()=>validate({...sample,cta_url:'https://elsewhere.example/checkout'}),/Choose a clinic booking destination/)
})
test('blocks tampered booking parameters',()=>{
 assert.throws(()=>validate({...sample,cta_url:'/patient/book?branch_id=1&admin=true'}),/Invalid booking destination/)
})
test('rejects service target without clinic',()=>{
 assert.throws(()=>validate({...sample,cta_url:'/patient/book?branch_id=1&service_id=3'}),/Select a valid service/)
})
test('non promotional news cannot claim a promotion',()=>{
 assert.throws(()=>validate({...sample,type:'news',promotion_id:8}),/valid clinic promotion/)
})
