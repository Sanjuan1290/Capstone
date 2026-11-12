'use strict'
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const source=fs.readFileSync(path.resolve(__dirname,'../../routers/branchAllInventory.js'),'utf8')
const metrics=require('../../utils/allInventoryOverview')
const data=[]
for(let i=1;i<=225;i++)data.push({id:i,branch_id:i%2?1:2,branch_name:i%2?'Laguna':'Tagaytay',barcode:`CODE${i}`,name:i<=3?'Same Medicine':`Product ${String(i).padStart(4,'0')}`,category:'medical',item_type:'supplies',stock:5,stock_base:5,threshold:3,selling_price:25,nearest_expiry:null})
function setup(){
  const queries=[],routes={}
  const database={query:async(sql,args)=>{
    queries.push({sql,args})
    if(sql.includes('FROM clinic_branches'))return [[{id:1,name:'Laguna',is_active:1},{id:2,name:'Tagaytay',is_active:1}].filter(row=>!args?.length||args.includes(row.id))]
    if(sql.includes('FROM inventory i'))return [data.filter(item=>!args?.length||args.includes(item.branch_id))]
    throw new Error('Unexpected database query')
  }}
  const mod={exports:{}}
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require:name=>{
    if(name==='../db/connect')return database
    if(name==='../utils/date')return {getTodayDateOnly:()=> '2026-11-12',addDaysDateOnly:()=> '2026-12-12'}
    if(name==='../utils/allInventoryOverview')return metrics
    throw new Error('Unexpected import '+name)
  }})
  mod.exports.registerAllInventory({get:(route,...handlers)=>routes[route]={guards:handlers.slice(0,-1),handler:handlers.at(-1)}},()=>{})
  async function run(route,query={}){
    const res={statusCode:200,status(n){this.statusCode=n;return this},json(obj){this.body=obj;return this}}
    await routes[route].handler({query},res)
    return res
  }
  return {routes,queries,run}
}
test('export and inventory page share Super Admin guard and read only GET routes',()=>{
  const {routes}=setup()
  assert.equal(routes['/inventory/all'].guards[0],routes['/inventory/all/export'].guards[0])
  assert.ok(routes['/inventory/all/export'])
})
test('export includes more than 200 records without changing UI pagination',async()=>{
  const {run,queries}=setup()
  const page=await run('/inventory/all',{page:'1',limit:'10'})
  const exportResult=await run('/inventory/all/export',{page:'1',limit:'10'})
  assert.equal(page.body.rows.length,10)
  assert.equal(exportResult.body.rows.length,225)
  assert.equal(exportResult.body.total,225)
  assert.equal(exportResult.body.summary.total_selling_value,225*5*25)
  assert.equal(exportResult.body.rows.find(r=>r.id===1)?.barcode,'CODE1')
  assert.ok(exportResult.body.rows.some(r=>r.id===1))
  assert.equal(exportResult.body.view,'by_branch')
  assert.ok(queries.every(row=>/^SELECT\s/i.test(row.sql.trim())))
})
test('branch filter and invalid IDs apply to exports',async()=>{
  const {run}=setup()
  const selected=await run('/inventory/all/export',{branch_ids:'1'})
  assert.ok(selected.body.rows.every(row=>row.branch_id===1))
  const invalid=await run('/inventory/all/export',{branch_ids:'oops'})
  assert.equal(invalid.statusCode,400)
})

test('identically named inventory records stay separate across branches and inside a branch',async()=>{
  const {run}=setup()
  const exportResult=await run('/inventory/all/export')
  const matching=exportResult.body.rows.filter(r=>r.name==='Same Medicine')
  assert.equal(matching.length,3)
  assert.deepEqual(Array.from(matching,r=>r.id),[1,3,2])
  assert.deepEqual(Array.from(matching,r=>r.branch_id),[1,1,2])
  assert.equal(exportResult.body.total,225)
  assert.ok(exportResult.body.rows.every(r=>r.id>0 && r.branch_id>0))
})
