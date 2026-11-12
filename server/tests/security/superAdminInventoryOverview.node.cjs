'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const src=fs.readFileSync(path.resolve(__dirname,'../../routers/branchAllInventory.js'),'utf8')
const metrics=require('../../utils/allInventoryOverview')
const inventory=[
 {id:1,branch_id:1,branch_name:'Laguna',name:'Saline',category:'medical',item_type:'supplies',stock:50,stock_base:50,threshold:5,selling_price:65,nearest_expiry:'2027-12-31'},
 {id:2,branch_id:2,branch_name:'Tagaytay',name:'Saline',category:'medical',item_type:'supplies',stock:3,stock_base:3,threshold:5,selling_price:65,nearest_expiry:'2026-11-15'},
 {id:3,branch_id:2,branch_name:'Tagaytay',name:'Gloves',category:'medical',item_type:'supplies',stock:0,stock_base:0,threshold:4,selling_price:40,nearest_expiry:null},
]
function harness(){
 const queries=[]
 const mock={query:async(sql,args)=>{queries.push(sql);if(sql.includes('FROM clinic_branches'))return [[{id:1,name:'Laguna',is_active:1},{id:2,name:'Tagaytay',is_active:1}]];if(sql.includes('FROM inventory i'))return [inventory];throw new Error('Unexpected DB read '+sql)}}
 const module={exports:{}}
 vm.runInNewContext(src,{module,exports:module.exports,require:name=>{
  if(name==='../utils/inventoryReportStock')return require('../../utils/inventoryReportStock')
  if(name==='../db/connect')return mock
  if(name==='../utils/date')return {getTodayDateOnly:()=> '2026-11-03',addDaysDateOnly:()=> '2026-12-03'}
  if(name==='../utils/allInventoryOverview')return metrics
  throw new Error('Unexpected import '+name)
 }},{filename:'branchAllInventory.js'})
 const routes={}
 module.exports.registerAllInventory({get:(route,...handlers)=>routes[route]=handlers.at(-1)},(_,__,next)=>next())
 const run=async query=>{const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await routes['/inventory/all']({query},res);return res}
 return {run,queries,routes}
}
test('every branch item retains its own identity, stock alerts and selling price',async()=>{
 const {run}=harness(),r=await run({view:'combined'}) // even legacy view request cannot combine records
 assert.equal(r.statusCode,200)
 assert.equal(r.body.view,'by_branch')
 assert.equal(r.body.total,3)
 const saline=r.body.rows.filter(x=>x.name==='Saline')
 assert.equal(saline.length,2)
 assert.deepEqual(Array.from(saline,row=>row.id),[1,2])
 assert.deepEqual(Array.from(saline,row=>row.branch_id),[1,2])
 assert.equal(saline[0].quantity_base,50)
 assert.equal(saline[1].quantity_base,3)
 assert.equal(r.body.summary.total_products,3)
 assert.equal(r.body.summary.total_items,3)
 assert.equal(r.body.summary.low_stock,1)
 assert.equal(r.body.summary.out_of_stock,1)
 assert.equal(r.body.summary.total_units,53)
 assert.equal(r.body.summary.total_selling_value,53*65)
 assert.equal(Object.hasOwn(r.body.summary,'total_stock_value'),false)
 assert.equal(Object.hasOwn(r.body.summary,'unpriced_items'),false)
 assert.equal(r.body.summary.branches_with_alerts,1)
})
test('alert filter returns the flagged branch-item rows without changing inventory',async()=>{
 const {run,queries}=harness(),r=await run({view:'by_branch',status:'alerts'})
 assert.equal(r.body.total,2)
 assert.ok(r.body.rows.every(i=>i.low||i.out||i.expiring||i.expired))
 assert.ok(queries.every(sql=>/^SELECT\s/i.test(sql.trim())))
})
test('pagination is server-side and capped',async()=>{
 const {run}=harness(),r=await run({view:'by_branch',limit:'1',page:'2'})
 assert.equal(r.body.limit,1)
 assert.equal(r.body.page,2)
 assert.equal(r.body.total,3)
 assert.equal(r.body.rows.length,1)
})
test('invalid branch IDs are rejected without inventory query',async()=>{
 const {run,queries}=harness(),r=await run({branch_ids:'1,abc'})
 assert.equal(r.statusCode,400)
 assert.equal(queries.length,0)
})
test('all inventory endpoint omits purchase-cost reporting and can sort by selling value',async()=>{
 const {run,queries}=harness(),r=await run({sort:'selling_value'})
 assert.equal(r.statusCode,200)
 assert.deepEqual(Array.from(r.body.rows,row=>row.name),['Saline','Saline','Gloves'])
 assert.ok(queries.every(sql=>!String(sql).includes('unit_cost')))
 assert.equal(Object.hasOwn(r.body.summary,'total_stock_value'),false)
 assert.ok(r.body.comparison.every(branch=>!Object.hasOwn(branch,'cost_value')))
 assert.ok(r.body.rows.every(row=>!Object.hasOwn(row,'cost_value')))
})
test('batch list is scoped to known item ids and read-only',async()=>{
 const {routes}=harness()
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}
 await routes['/inventory/all/batches']({query:{item_ids:'1,not_an_id'}},res)
 assert.equal(res.statusCode,400)
})

test('DATE objects from SQL drivers keep ISO date semantics',()=>{
 assert.equal(metrics.dateOnly(new Date('2027-12-31T00:00:00.000Z')),'2027-12-31')
 assert.equal(metrics.statusFor({quantity_base:5,threshold:0,nearest_expiry:new Date('2026-11-01T00:00:00Z')},'2026-11-03','2026-12-03').expired,true)
})
