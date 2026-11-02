import test from 'node:test'
import assert from 'node:assert/strict'
import {areaFromEvent,areaLabel,safeChanges,eventOutcome,formatAuditValue} from '../src/utils/auditLogPresentation.mjs'
test('service category belongs to Services & Pricing, not Billing',()=>{
 const row={entity_type:'billing_service_category',action:'system.service_category_created'}
 assert.equal(areaFromEvent(row),'services_pricing')
 assert.equal(areaLabel(row),'Services & Pricing')
})
test('server-provided area wins and legacy area remains compatible',()=>{
 assert.equal(areaFromEvent({area_code:'services_pricing',entity_type:'billing_record'}),'services_pricing')
 assert.equal(areaFromEvent({area_code:'service_catalog'}),'services_pricing')
})
test('displays safe changes while hiding clinical and credential values',()=>{
 const result=safeChanges({low_stock_alert:5,price:50,diagnosis:'old',password:'x'},{low_stock_alert:10,price:55,diagnosis:'new',password:'y'})
 assert.deepEqual(result.map(v=>v.field),['low_stock_alert','price'])
 assert.deepEqual(result.find(v=>v.field==='low_stock_alert').after,10)
})
test('unknown sensitive values do not appear in change summary',()=>{
 assert.deepEqual(safeChanges({phone:'0900',patient_name:'A',notes:'x'}, {phone:'0901',patient_name:'B',notes:'y'}),[])
})
test('legacy failed login is shown as Failed',()=>assert.equal(eventOutcome({action:'auth.login_failed',outcome:'success'}),'failure'))
test('values are displayed without dumping objects into logs',()=>assert.equal(formatAuditValue({secret:'x'}),'Updated'))
