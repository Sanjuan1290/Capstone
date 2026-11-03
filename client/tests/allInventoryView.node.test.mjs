import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createInventoryCsv,costDisplay,statusLabels,buildFilters} from '../src/pages/superAdminPage/inventoryView.mjs'

test('out-of-stock and expired alerts retain separate messages',()=>{
 assert.deepEqual(statusLabels({out:true,expired:true}).map(v=>v.label),['Out of stock','Expired stock'])
})
test('missing recorded cost never appears as an actual zero valuation',()=>{
 assert.equal(costDisplay({cost_value:0,priced_batch_count:0}).amount,'Not recorded')
 assert.equal(costDisplay({cost_value:50,priced_batch_count:1,active_batch_count:2}).note,'Partial cost data')
})
test('CSV export includes visible rows only and escapes formula-injection strings',()=>{
 const rows=[{name:'=HYPERLINK("http://example.test")',category:'medical',item_type:'supplies',quantity_base:5,branch_coverage:1,nearest_expiry:'2027-01-01',cost_value:0,selling_value:100,priced_batch_count:0,out:false}]
 const csv=createInventoryCsv(rows,'combined')
 assert.match(csv,/^\uFEFF/)
 assert.match(csv,/"'=HYPERLINK/)
 assert.match(csv,/"Product","Category","Type"/)
 assert.equal(csv.split('\r\n').filter(Boolean).length,2)
})
test('query helper encodes scope and excludes empty settings',()=>{
 const params=new URLSearchParams(buildFilters({view:'by_branch',search:'alcohol pad',include_archived:false,page:2,limit:10,branch_ids:''}))
 assert.equal(params.get('search'),'alcohol pad')
 assert.equal(params.get('include_archived'),null)
 assert.equal(params.get('branch_ids'),null)
 assert.equal(params.get('page'),'2')
})
