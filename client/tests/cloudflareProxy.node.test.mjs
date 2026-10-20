import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/[[path]].js'

test('Cloudflare proxy forwards API method, credentials, query and request origin', async () => {
  const oldFetch = globalThis.fetch
  let captured
  globalThis.fetch = async (url, options) => {
    captured = {url, options}
    return new Response(JSON.stringify({ok:true}), { status: 201, headers: { 'set-cookie':'patient_token=test; Path=/; HttpOnly; Secure', 'content-type':'application/json' } })
  }
  try {
    const req = new Request('https://clinic.example/api/patient/appointments?day=3', {method:'POST',headers:{'Origin':'https://clinic.example','Cookie':'patient_token=test','Content-Type':'application/json','X-Forwarded-For':'spoof'},body:'{}'})
    const res = await onRequest({request:req,env:{API_ORIGIN:'https://myapi.onrender.com'}})
    assert.equal(captured.url,'https://myapi.onrender.com/api/patient/appointments?day=3')
    assert.equal(captured.options.method,'POST')
    assert.equal(captured.options.headers.get('Origin'),'https://clinic.example')
    assert.equal(captured.options.headers.get('Cookie'),'patient_token=test')
    assert.equal(captured.options.headers.get('X-Forwarded-For'),null)
    assert.equal(res.status,201)
    assert.match(res.headers.get('set-cookie'),/patient_token=/)
    assert.equal(res.headers.get('cache-control'),'no-store')
  } finally {globalThis.fetch=oldFetch}
})
test('cloudflare API gateway refuses webhooks and unsafe/missing origins',async()=>{
  let res=await onRequest({request:new Request('https://clinic.example/api/webhooks/paymongo',{method:'POST'}),env:{API_ORIGIN:'https://myapi.onrender.com'}})
  assert.equal(res.status,404)
  res=await onRequest({request:new Request('https://clinic.example/api/health'),env:{}})
  assert.equal(res.status,503)
  res=await onRequest({request:new Request('https://clinic.example/api/health'),env:{API_ORIGIN:'http://localhost:3000'}})
  assert.equal(res.status,503)
})
test('Cloudflare proxy preserves a streaming response', async()=>{
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: connected\n\n'));c.close()}}),{headers:{'content-type':'text/event-stream'}})
  try {
    const res=await onRequest({request:new Request('https://clinic.example/api/events/patient'),env:{API_ORIGIN:'https://myapi.onrender.com'}})
    assert.equal(res.headers.get('content-type'),'text/event-stream')
    assert.equal(await res.text(),'event: connected\n\n')
  } finally {globalThis.fetch=oldFetch}
})
