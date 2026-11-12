const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../../..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

function loadCommonJs(rel, dependencies) {
  const source = read(rel)
  const module = {exports: {}}
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {setTimeout, clearTimeout})(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

test('branch workspace and branch admin both expose a protected available-services route', async () => {
  const routes = []
  const db = {query: async (sql, params) => {
    assert.match(sql, /billing_records WHERE id=\? AND branch_id=\?/)
    assert.deepEqual(Array.from(params), ['91', 30002])
    return [[{id: 91}]]
  }}
  const handler = async (req,res) => res.json({services:[{id:1,service_name:'Dermatology Consultation',default_price:800}],promotions:[]})
  const source = loadCommonJs('server/routers/branchBillPreviewReads.js', {
    '../db/connect': db,
    '../controllers/staff.controller': {getFinalizePreview:()=>{}},
    '../utils/billingPromotionEndpoints': {forBill: handler},
  })
  const pass=(req,res,next)=>next()
  source.registerBranchBillPreviewReads({get(path,...stack){routes.push({path,stack})}}, {
    requireSuper:pass,
    branchContext:pass,
    requirePermission:key=>{assert.equal(key,'billing');return pass},
  })
  for (const url of ['/my/legacy/billing/:id/available-promotions','/workspace/:branchId/legacy/billing/:id/available-promotions']) {
    const route=routes.find(r=>r.path===url)
    assert.ok(route, `Missing ${url}`)
    assert.ok(route.stack.length>=4, 'Missing branch auth, billing authorization or ownership checks')
    const req={params:{id:'91'},branchId:30002}
    let result=null
    const res={status(c){this.statusCode=c;return this},json(v){result=v;return this}}
    for(let index=0;index<route.stack.length;index++) {
      let nextCalled=false
      await route.stack[index](req,res,()=>{nextCalled=true})
      if (!nextCalled) break
    }
    assert.equal(result.services[0].service_name,'Dermatology Consultation')
  }
})

test('a bill outside the selected branch is not returned', async () => {
  const routes=[]
  const source=loadCommonJs('server/routers/branchBillPreviewReads.js',{
    '../db/connect':{query:async()=>[[]]},
    '../controllers/staff.controller':{getFinalizePreview:()=>{}},
    '../utils/billingPromotionEndpoints':{forBill:()=>{throw new Error('should not run')}}
  })
  const pass=(req,res,next)=>next()
  source.registerBranchBillPreviewReads({get:(path,...stack)=>routes.push({path,stack})},{requireSuper:pass,branchContext:pass,requirePermission:()=>pass})
  const route=routes.find(x=>x.path==='/my/legacy/billing/:id/available-promotions')
  let result=null
  const req={params:{id:'33'},branchId:30002}
  const res={status(c){this.statusCode=c;return this},json(v){result=v;return this}}
  for(const fn of route.stack){let nextCalled=false;await fn(req,res,()=>{nextCalled=true});if(!nextCalled)break}
  assert.equal(res.statusCode,404)
  assert.match(result.message,/not found/i)
})

test('catalog endpoint filters by bill clinic and authorized branch', async () => {
  const calls=[]
  const api = loadCommonJs('server/utils/billingPromotionEndpoints.js', {
    '../db/connect':{query:async (sql,params)=>{
      calls.push({sql,params:Array.from(params)})
      return [[{appointment_date:'2026-11-12',clinic_type:'medical'}]]
    }},
    './billingServicePromotions':{listEligiblePromotions:async(db,branchId,date,serviceIds)=>{
      assert.equal(branchId,30002)
      assert.deepEqual(Array.from(serviceIds),[9])
      return []
    }},
    './billing':{listBillingCatalog:async args=>{
      assert.equal(args.branchId,30002)
      assert.equal(args.clinicType,'medical')
      return [{id:9,service_name:'Vaccination',default_price:1700,clinic_type:'medical',materials:[]}]
    }}
  })
  let body=null
  await api.forBill({params:{id:'21'},branchId:30002},{json:v=>{body=v}})
  assert.equal(body.services.length,1)
  assert.equal(body.services[0].default_price,1700)
  assert.match(calls[0].sql,/a.branch_id=b.branch_id/)
  assert.deepEqual(calls[0].params,['21',30002])
})

test('checkout screens surface service catalog errors rather than silently hiding them', () => {
  for(const portal of ['adminPage/Admin_CheckoutDetail.jsx','staffPage/Staff_CheckoutDetail.jsx']){
    const code=read(`client/src/pages/${portal}`)
    assert.match(code,/setServiceOptionsError\(err\?\.message/)
    assert.match(code,/onRetry=\{refreshServiceOptions\}/)
    assert.doesNotMatch(code,/getBillingPromotionOptions\(billingId\)\.catch\(\(\)=>\(\{services:\[\],promotions:\[\]\}\)\)/)
  }
  const editor=read('client/src/components/billing/CheckoutServiceEditor.jsx')
  assert.match(editor,/Could not load available clinic services/)
  assert.match(editor,/No active services are available/)
  assert.match(editor,/disabled=\{loading \|\| Boolean\(loadError\) \|\| services.length===0\}/)
})
