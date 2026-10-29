'use strict'
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.join(__dirname, '../../..')
const read = p => fs.readFileSync(path.join(root,p),'utf8')

test('Staff System Setup is available only by explicit system_setup permission',()=>{
 const front=read('client/src/components/layouts/StaffLayout.jsx')
 const server=read('server/routers/staff.router.js')
 assert.match(front,/permission: 'system_setup', name: 'System Setup'/)
 assert.match(server,/can\('system_setup'\), readSystemSetup/)
 assert.match(server,/can\('system_setup'\), branchPromotions\.save/)
 assert.doesNotMatch(server,/\/admin-access\/promotions\/:id\/notify/)
})
test('Staff setup writes reuse branch-scoped validations instead of 403 placeholders',()=>{
 const server=read('server/routers/staff.router.js')
 for (const expression of [
  /system-setup\/suppliers'.*saveBranchSupplier/,/system-setup\/location-types'.*saveBranchLocationType/,
  /billing\/catalog'.*branchCatalog\.saveService/,/inventory\/locations'.*updateSystemStockRoom/
 ]) assert.match(server,expression)
})
test('Staff promotion creation records actor safely without a dangling Admin foreign reference',()=>{
 const source=read('server/routers/branchPromotions.js')
 assert.match(source,/req\.adminContext \? req\.user\.id : null/)
 assert.match(source,/userRole:req\.adminContext\?\.account_role \|\| 'staff'/)
 assert.match(source,/WHERE branch_id=\?/)
})
test('Patient portal loads branches and requires explicit selection',()=>{
 const layout=read('client/src/components/layouts/PatientLayout.jsx')
 const context=read('client/src/context/PatientBranchContext.jsx')
 assert.match(layout,/!selectedBranch/)
 assert.match(layout,/aria-label="Change clinic branch"/)
 assert.match(layout,/<Outlet key=\{branchId\}/)
 assert.match(context,/sessionStorage\.setItem\(keyFor\(patientId\)/)
 assert.match(context,/valid\.some\(b => String\(b\.id\) === saved\)/)
})
test('All patient promotion surfaces require the selected branch',()=>{
 const dash=read('client/src/pages/patientPage/PatientDashboard.jsx')
 const offers=read('client/src/pages/patientPage/PatientOffers.jsx')
 const book=read('client/src/pages/patientPage/BookAppointment.jsx')
 assert.match(dash,/getCurrentPromotions\(branchId\)/)
 assert.match(offers,/getCurrentPromotions\(branchId\)/)
 assert.match(book,/usePatientBranch\(\)/)
})
test('Patient promotion API rejects absent branch and cannot return other branch offers',async()=>{
 const location=path.join(root,'server/controllers/promotions.controller.js')
 const original=Module._load
 let executed=null
 const mockDb={query:async(sql,args)=>{executed={sql,args};return [[]]}}
 Module._load=function(request,parent,isMain){
  if(parent?.filename===location && request==='../db/connect')return mockDb
  if(parent?.filename===location && request==='../utils/date')return {getTodayDateOnly:()=> '2026-10-28'}
  if(parent?.filename===location && request==='../utils/audit')return {writeAuditLog:async()=>{}}
  if(parent?.filename===location && request==='../utils/notifications')return {createNotification:async()=>{}}
  return original.apply(this,arguments)
 }
 let getActivePromotions
 try{delete require.cache[require.resolve(location)];({getActivePromotions}=require(location))}finally{Module._load=original}
 const res=()=>({code:200,status(n){this.code=n;return this},json(x){this.body=x;return this}})
 const invalid=res(); await getActivePromotions({query:{}},invalid)
 assert.equal(invalid.code,400);assert.equal(executed,null)
 const valid=res();await getActivePromotions({query:{branch_id:'2'}},valid)
 assert.equal(valid.code,200)
 assert.match(executed.sql,/p\.branch_id=\?/)
 assert.doesNotMatch(executed.sql,/IS NULL OR p\.branch_id/)
 assert.equal(executed.args[2],2)
})
