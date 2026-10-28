'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {addDaysDateOnly}=require('../../utils/date')
test('cross-branch inventory expiry uses the Manila date at the UTC boundary',async()=>{
  const handlers=new Map(),file=path.resolve(__dirname,'../../routers/branchAllInventory.js')
  const inventory=[{id:1,branch_id:2,name:'Synthetic medicine',stock_base:5,stock:5,threshold:1,nearest_expiry:'2026-10-27',cost_value:10,selling_price:3}]
  const db={query:async sql=>sql.includes('SELECT id,name,code,is_active FROM clinic_branches')?[[{id:2,name:'Synthetic Branch'}]]:[inventory]}
  class BoundaryDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-27T16:05:00Z']))}static now(){return Date.parse('2026-10-27T16:05:00Z')}}
  const mod={exports:{}}
  vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(file,'utf8')}\n})`,{Date:BoundaryDate},{filename:file})(name=>{
    if(name==='../db/connect')return db
    if(name==='../utils/date')return {getTodayDateOnly:()=> '2026-10-28',addDaysDateOnly}
    throw Error('Unexpected inventory dependency')
  },mod,mod.exports)
  mod.exports.registerAllInventory({get:(route,...chain)=>handlers.set(route,chain.at(-1))},()=>{})
  let payload
  await handlers.get('/inventory/all')({query:{view:'by_branch',status:'expired'}},{json:value=>{payload=value}})
  assert.equal(payload.rows.length,1)
  assert.equal(payload.rows[0].expired,true)
  assert.equal(payload.summary.expired,1)
  assert.equal(payload.summary.expiring_30_days,0)
})
