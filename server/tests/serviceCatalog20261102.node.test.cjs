const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const utils=fs.readFileSync(path.join(__dirname,'../utils/billing.js'),'utf8')
const branches=fs.readFileSync(path.join(__dirname,'../routers/branches.router.js'),'utf8')
const ui=fs.readFileSync(path.join(__dirname,'../../client/src/pages/adminPage/Admin_BillingCatalog.jsx'),'utf8')
function hydrateFromRows(serviceRows,materialRows){
  const module={exports:{}}
  const context={require:id=>id==='../db/connect'?{}:{},module,exports:module.exports,console}
  vm.runInNewContext(utils,context,{filename:'billing.js'})
  const sql=[]
  return module.exports.hydrateBillingCatalogRows(serviceRows,{query:async(statement,params)=>{sql.push({statement,params});return [materialRows]}}).then(rows=>({rows,sql}))
}
test('branch catalog hydrates saved consumables rather than sending raw rows',()=>{
 assert.match(branches,/hydrateBillingCatalogRows\(rows,db\)/)
 assert.match(branches,/bsc\.branch_id=\?/)
})
test('base service price and final patient price remain separate',async()=>{
 const {rows}=await hydrateFromRows([{id:71,default_price:455,consultation_fee:350,branch_id:1,category:'Medical Consultation'}],[{id:51,billing_service_id:71,inventory_id:13,material_name:'Sterile Gloves',quantity:1,inventory_name:'Sterile Gloves',sort_order:0},{id:52,billing_service_id:71,inventory_id:14,material_name:'Sodium Chloride',quantity:1,sort_order:1}])
 assert.equal(rows[0].consultation_fee,350)
 assert.equal(rows[0].default_price,455)
 assert.equal(rows[0].patient_price,455)
 assert.equal(rows[0].materials.length,2)
 assert.equal(rows[0].materials[0].inventory_id,13)
})
test('catalog load does not fabricate consumables for no-supply service',async()=>{
 const {rows}=await hydrateFromRows([{id:9,default_price:250,consultation_fee:250,branch_id:1}],[])
 assert.deepEqual(Array.from(rows[0].materials),[])
 assert.equal(rows[0].consultation_fee,250)
})
test('materials hydration query binds only the selected IDs',async()=>{
 const {sql}=await hydrateFromRows([{id:71,default_price:455,consultation_fee:350}],[])
 assert.match(sql[0].statement,/WHERE m.billing_service_id IN \(\?\)/)
 assert.deepEqual(Array.from(sql[0].params),[71])
})
test('service list labels the payable total',()=>{
 assert.match(ui,/Total Patient Price/)
 assert.match(ui,/patientPrice\(service\)/)
})
test('branch service write adds consumables and saves within transaction',()=>{
 const writer=fs.readFileSync(path.join(__dirname,'../routers/branchCatalogWrites.js'),'utf8')
 assert.match(writer,/total\+=Number\(item\.selling_price\)\*Number\(m\.quantity\)/)
 assert.match(writer,/await conn\.query\(`INSERT INTO billing_service_materials/)
 assert.match(writer,/await conn\.commit\(\)/)
})
test('saving a service persists the two consumable rows and the 455 patient price',async()=>{
 const writerSource=fs.readFileSync(path.join(__dirname,'../routers/branchCatalogWrites.js'),'utf8')
 const billingModule={exports:{}}
 vm.runInNewContext(utils,{require:()=>({}),module:billingModule,exports:billingModule.exports,console})
 let committed=0,rolledBack=0,updatedPrice=null
 const saved=[]
 const conn={beginTransaction:async()=>{},commit:async()=>{committed++},rollback:async()=>{rolledBack++},release(){},query:async(sql,args)=>{
  if(sql.includes('SELECT id,name,is_active FROM billing_service_categories'))return [[{id:2,name:'Medical Consultation',is_active:1}]]
  if(sql.includes('SELECT id,name,category,selling_price,archived_at FROM inventory'))return [[{id:args[0],category:'medical',selling_price:Number(args[0])===10?40:65,name:Number(args[0])===10?'Gloves':'Sodium Chloride',archived_at:null}]]
  if(sql.includes('INSERT INTO billing_service_catalog')){updatedPrice=args[4];return [{insertId:71}]}
  if(sql.includes('INSERT INTO billing_service_materials')){saved.push(args);return [{}]}
  if(sql.startsWith('DELETE m FROM billing_service_materials'))return [{}]
  throw new Error('Unexpected SQL: '+sql)
 }}
 const writer={exports:{}}
 vm.runInNewContext(writerSource,{require:id=>id==='../db/connect'?{getConnection:async()=>conn}:id==='../utils/billing'?billingModule.exports:id==='../utils/bookingPolicy'?{validateAverageDurationMinutes:n=>n}:id==='../utils/audit'?{writeAuditLog:async()=>{}}:id==='../utils/clinicEvents'?{afterSuccessfulMutation:()=>()=>{}}:{},module:writer,exports:writer.exports,console})
 const response={statusCode:200,body:null,status(code){this.statusCode=code;return this},json(data){this.body=data;return this}}
 await writer.exports.saveService({params:{},branchId:1,user:{id:1},adminContext:{account_role:'admin'},body:{category_id:2,service_name:'Minor Wound Cleaning',clinic_type:'medical',consultation_fee:350,average_duration_minutes:30,materials:[{inventory_id:10,material_name:'Gloves',quantity:1},{inventory_id:11,material_name:'Sodium Chloride',quantity:1}]}},response)
 assert.equal(response.statusCode,201)
 assert.equal(updatedPrice,455)
 assert.equal(response.body.default_price,455)
 assert.equal(saved.length,2)
 assert.equal(committed,1)
 assert.equal(rolledBack,0)
})
