const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const router = fs.readFileSync(path.join(__dirname,'../../routers/staff.router.js'),'utf8')
const staff = fs.readFileSync(path.join(__dirname,'../../controllers/staff.controller.js'),'utf8')

function compile(fragment,ctx){const module={exports:{}};vm.runInNewContext(`${fragment}\nmodule.exports={mustOwn,ownAppointment,ownBill,ownDoctor}`,{...ctx,module});return module.exports}

test('Staff ID middleware rejects foreign appointments, bills and doctors before controller executes',async()=>{
 const sql=[];const db={query:async(query,args)=>{sql.push([query,args]);return [[args[0]===42 && args[1]===7?{id:42}:null].filter(Boolean)]}}
 const code=router.slice(router.indexOf('const mustOwn ='),router.indexOf('// ── Auth / universal'))
 const {ownAppointment,ownBill,ownDoctor}=compile(code,{db})
 const attempt=async(handler,id,branchId)=>{
  let status=200,body=null,next=false
  await handler({params:{id:String(id)},branchId},{status(code){status=code;return this},json(obj){body=obj}},()=>{next=true})
  return {status,body,next}
 }
 for(const handler of [ownAppointment,ownBill,ownDoctor]){
  const allowed=await attempt(handler,42,7)
  assert.equal(allowed.next,true)
  const blocked=await attempt(handler,43,7)
  assert.equal(blocked.status,404)
  assert.equal(blocked.next,false)
 }
 assert.ok(sql.every(([query,params])=>/branch_id\s*=\s*\?/.test(query)&&params[1]===7))
})

test('checkout validation queries require branch ownership and reject a foreign inventory item',async()=>{
 const start=staff.indexOf('const parseBillingItemDetails =')
 const end=staff.indexOf('const dispenseCheckoutSupplies =')
 assert.ok(start>=0&&end>start)
 const context={module:{exports:{}}, db:{},getTodayDateOnly:()=>'2026-10-15'}
 vm.runInNewContext(`${staff.slice(start,end)}\nmodule.exports=validateStaffSupplyAvailability`,context)
 const validate=context.module.exports
 await assert.rejects(validate([],{},undefined),/Verified branch required/)
 const seen=[]
 const executor={query:async(sql,args)=>{seen.push([sql,args]);return [[/*foreign ID not found in authorized branch*/]]}}
 const result=await validate([{item_type:'supply',source_type:'staff_supply',source_inventory_id:999,quantity:1,service_name:'Foreign item'}],executor,7)
 assert.equal(result.length,1)
 assert.equal(result[0].sufficient,false)
 assert.equal(seen.length,1)
 assert.match(seen[0][0],/branch_id=\?/)
 assert.equal(seen[0][1][1],7)
})

test('checkout inventory, locations and batches are all checked for bill branch before stock-out',()=>{
 for(const term of ['WHERE id=? AND branch_id=? AND archived_at IS NULL','WHERE id=? AND branch_id=? AND COALESCE(is_active,1)=1','ib.id = ? AND ib.inventory_id = ? AND ib.branch_id=?'])assert.ok(staff.includes(term),`Missing checkout ownership check: ${term}`)
 assert.match(staff,/Number\(bill\?\.branch_id\)!==Number\(branchId\)/)
 assert.match(staff,/existingBranchId!==Number\(req\.branchId\)/)
})

