import test from 'node:test'
import assert from 'node:assert/strict'
import {chartDomain,chartFraction} from '../src/utils/chartScale.mjs'
import {formatInventoryQuantity} from '../src/utils/inventoryQuantity.mjs'
import {buildWalkInIntakeFormHtml} from '../src/utils/printWalkInIntakeForm.js'
import {safeChanges} from '../src/utils/auditLogPresentation.mjs'
test('signed collections remain inside the chart domain, including refund-only periods',()=>{
 for(const values of [[100,-200,0],[-500,-100],[0,0],[1,2]]){
  const domain=chartDomain(values)
  for(const value of values)assert.ok(chartFraction(value,domain)>=0&&chartFraction(value,domain)<=1)
  assert.ok(chartFraction(0,domain)>=0&&chartFraction(0,domain)<=1)
 }
})
test('whole-unit movement displays remove .00 while retaining real historical fractions and unknown balances',()=>{
 assert.equal(formatInventoryQuantity('12.00'),'12');assert.equal(formatInventoryQuantity('0.00'),'0')
 assert.equal(formatInventoryQuantity('0.50'),'0.5');assert.equal(formatInventoryQuantity(null),'Not recorded')
 assert.equal(formatInventoryQuantity(undefined),'Not recorded')
})
test('intake contains the current minimum patient, service and consent fields, including a guardian signature',()=>{
 const html=buildWalkInIntakeFormHtml()
 for(const text of ['Full name','Birthdate','Requested service','Reason for visit','Privacy consent','parent / guardian'])assert.ok(html.includes(text),text)
 for(const text of ['Email Address','Home Address','Preferred Doctor','Queue / Reference','Account Check','Age ('])assert.ok(!html.includes(text),text)
 assert.match(html,/size:A4 portrait/)
})
test('audit changes display item quantities and movement details without exposing private notes',()=>{
 const changes=safeChanges({quantity:12},{quantity:4,moved_quantity:8,movement_type:'clinical_use',note:'private patient concern'},'inventory')
 assert.equal(changes.find(row=>row.field==='quantity').before,12)
 assert.equal(changes.find(row=>row.field==='quantity').after,4)
 assert.equal(changes.find(row=>row.field==='moved_quantity').after,8)
 assert.ok(!changes.some(row=>row.field==='note'))
})
