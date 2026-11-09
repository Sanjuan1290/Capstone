import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getMyAppointments } from '../src/services/patient.service.js'
const source=readFileSync(new URL('../src/services/portal.service.js',import.meta.url),'utf8')
  .replace("'./cloudinaryScan'",JSON.stringify(new URL('../src/services/cloudinaryScan.js',import.meta.url).href))
const {getNotifications}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('patient and notification failures retain the backend explanation and request reference',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({message:'Clinic service temporarily unavailable.',code:'SERVICE_UNAVAILABLE',request_id:'qa-20261109'}),{status:503,headers:{'content-type':'application/json'}}))
 for(const call of [()=>getMyAppointments(),()=>getNotifications('patient')])await assert.rejects(call,error=>error.message.includes('Clinic service temporarily unavailable.')&&error.message.includes('qa-20261109')&&error.code==='SERVICE_UNAVAILABLE'&&error.status===503)
})
test('an HTML fallback is reported as an unreadable API response',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>Unavailable</html>',{status:502,headers:{'content-type':'text/html'}}))
 await assert.rejects(()=>getMyAppointments(),error=>error.status===502&&error.message.includes('unreadable response'))
})
