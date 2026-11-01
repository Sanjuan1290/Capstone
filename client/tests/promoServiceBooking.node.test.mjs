import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {promotionBookingPath} from '../src/utils/promotionBookingPath.mjs'

const dir={services:[{id:30001,branch_id:1,clinic_type:'derma'}, {id:2,branch_id:1,clinic_type:'medical'}, {id:30002,branch_id:30002,clinic_type:'derma'}]}
test('one linked service preselects correct service and clinic',()=>{
 const url=new URL(promotionBookingPath({id:17,branch_id:1,service_ids:[30001]},dir),'https://example.test')
 assert.equal(url.pathname,'/patient/book')
 assert.deepEqual(Object.fromEntries(url.searchParams),{branch_id:'1',promotion_id:'17',clinic:'derma',service_id:'30001'})
})
test('two services require patient to select a service',()=>{
 const url=new URL(promotionBookingPath({id:18,branch_id:1,service_ids:[30001,2]},dir),'https://example.test')
 assert.equal(url.searchParams.get('promotion_id'),'18')
 assert.equal(url.searchParams.has('service_id'),false)
})
test('branch mismatch never preselects service',()=>{
 const url=new URL(promotionBookingPath({id:18,branch_id:1,service_ids:[30002]},dir),'https://example.test')
 assert.equal(url.searchParams.has('service_id'),false)
})
test('no directory keeps promotion and branch, but never guesses a service',()=>{
 const url=new URL(promotionBookingPath({id:19,branch_id:1,service_ids:[30001]}),'https://example.test')
 assert.equal(url.searchParams.get('branch_id'),'1')
 assert.equal(url.searchParams.get('promotion_id'),'19')
 assert.equal(url.searchParams.has('service_id'),false)
})
test('service cards pin booking actions to the card bottom',()=>{
 const source=fs.readFileSync(new URL('../src/pages/LandingPages/LandingPage.jsx',import.meta.url),'utf8')
 assert.match(source,/carait-lift flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 p-6 shadow-sm/)
 assert.match(source,/className="mt-auto pt-6"><Action preview={preview} path={linkedBookingPath\(service/)
})
test('news page uses server-resolved offer destination instead of an unrelated generic url',()=>{
 const source=fs.readFileSync(new URL('../src/pages/LandingPages/News.jsx',import.meta.url),'utf8')
 assert.match(source,/post\.booking_url/)
 assert.match(source,/post\.booking_unavailable/)
})
