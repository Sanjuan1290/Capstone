const test=require('node:test'),assert=require('node:assert/strict')
const {provisionBranch}=require('../../utils/branchProvisioning')
const capture=async(mode,source=null)=>{
 const calls=[]
 await provisionBranch({query:async(sql,params)=>{calls.push({sql,params});return [[]]}},21,source,mode)
 return calls
}
test('blank mode seeds core branch infrastructure but no clinical catalogs',async()=>{
 const c=await capture('blank')
 assert.ok(c.some(x=>x.sql.includes('branch_booking_settings')))
 assert.ok(c.some(x=>x.sql.includes('inventory_locations')))
 assert.ok(!c.some(x=>x.sql.includes('billing_service_categories')))
 assert.ok(!c.some(x=>x.sql.includes('appointment_reason_options')))
})
test('standard mode seeds clinic categories and reasons without copying services',async()=>{
 const c=await capture('standard')
 assert.ok(c.some(x=>x.sql.includes('billing_service_categories')))
 assert.ok(c.some(x=>x.sql.includes('appointment_reason_options')))
 assert.ok(!c.some(x=>x.sql.includes('billing_service_catalog')))
})
test('copy mode copies service pricing but marks services requiring other-branch materials inactive',async()=>{
 const c=await capture('copy',17)
 const q=c.find(x=>x.sql.includes('INSERT IGNORE INTO billing_service_catalog'))
 assert.ok(q)
 assert.match(q.sql,/billing_service_materials/)
 assert.match(q.sql,/THEN 0 ELSE source.is_active/)
 assert.match(q.sql,/REVIEW MATERIALS BEFORE ACTIVATING/)
 assert.deepEqual(q.params,[21,17,21,17])
 assert.ok(!c.some(x=>x.sql.includes('INSERT INTO inventory ')||x.sql.includes('FROM patients')))
})
test('reject inconsistent setup configurations before SQL',async()=>{
 await assert.rejects(()=>capture('copy'),/source branch/i)
 await assert.rejects(()=>capture('blank',17),/Only copy mode/i)
 await assert.rejects(()=>capture('invalid'),/Invalid branch setup/i)
})

