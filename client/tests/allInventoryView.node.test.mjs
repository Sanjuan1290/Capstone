import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createInventoryCsv,statusLabels,buildFilters} from '../src/pages/superAdminPage/inventoryView.mjs'

test('out-of-stock and expired alerts retain separate messages',()=>{
 assert.deepEqual(statusLabels({out:true,expired:true}).map(v=>v.label),['Out of stock','Expired stock'])
})
test('CSV export includes visible rows only and escapes formula-injection strings',()=>{
 const rows=[{name:'=HYPERLINK("http://example.test")',category:'medical',item_type:'supplies',quantity_base:5,branch_coverage:1,nearest_expiry:'2027-01-01',selling_value:100,out:false}]
 const csv=createInventoryCsv(rows,'combined')
 assert.match(csv,/^\uFEFF/)
 assert.match(csv,/"'=HYPERLINK/)
 assert.match(csv,/"Product","Category","Type"/)
 assert.match(csv,/"Potential selling value \(PHP\)"/)
 assert.doesNotMatch(csv,/recorded cost|cost recording|purchase cost/i)
 assert.equal(csv.split('\r\n').filter(Boolean).length,2)
})
test('query helper encodes scope and excludes empty settings',()=>{
 const params=new URLSearchParams(buildFilters({view:'by_branch',search:'alcohol pad',include_archived:false,page:2,limit:10,branch_ids:''}))
 assert.equal(params.get('search'),'alcohol pad')
 assert.equal(params.get('include_archived'),null)
 assert.equal(params.get('branch_ids'),null)
 assert.equal(params.get('page'),'2')
})
