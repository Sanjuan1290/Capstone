import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { onRequest } from '../functions/api/[[path]].js'

const API_ORIGIN = 'https://myapi.onrender.com'
const API_PROXY_SECRET = 'test-proxy-secret-with-at-least-32-characters'
const signedHeaders = (method, target, clientIp, timestamp) => createHmac('sha256', API_PROXY_SECRET)
  .update(`${timestamp}\n${clientIp}\n${method}\n${target}`)
  .digest('hex')

test('Cloudflare proxy forwards API method, credentials, query and request origin', async () => {
  const oldFetch = globalThis.fetch
  let captured
  globalThis.fetch = async (url, options) => {
    captured = {url, options}
    return new Response(JSON.stringify({ok:true}), { status: 201, headers: { 'set-cookie':'patient_token=test; Path=/; HttpOnly; Secure', 'content-type':'application/json' } })
  }
  try {
    const target = '/api/patient/appointments?day=3'
    const clientIp = '198.51.100.42'
    const req = new Request(`https://clinic.example${target}`, {method:'POST',headers:{'Origin':'https://clinic.example','Cookie':'patient_token=test','Content-Type':'application/json','X-Forwarded-For':'spoof','CF-Connecting-IP':clientIp,'X-Carait-Client-IP':'spoof'},body:'{}'})
    const res = await onRequest({request:req,env:{API_ORIGIN,API_PROXY_SECRET}})
    assert.equal(captured.url,`${API_ORIGIN}${target}`)
    assert.equal(captured.options.method,'POST')
    assert.equal(captured.options.headers.get('Origin'),'https://clinic.example')
    assert.equal(captured.options.headers.get('Cookie'),'patient_token=test')
    assert.equal(captured.options.headers.get('X-Forwarded-For'),null)
    assert.equal(captured.options.headers.get('CF-Connecting-IP'),null)
    assert.equal(captured.options.headers.get('X-Carait-Client-IP'),clientIp)
    assert.match(captured.options.headers.get('X-Carait-Proxy-Time'),/^\d{10}$/)
    assert.equal(captured.options.headers.get('X-Carait-Proxy-Signature'), signedHeaders('POST',target,clientIp,captured.options.headers.get('X-Carait-Proxy-Time')))
    assert.equal(res.status,201)
    assert.match(res.headers.get('set-cookie'),/patient_token=/)
    assert.equal(res.headers.get('cache-control'),'no-store')
  } finally {globalThis.fetch=oldFetch}
})
test('cloudflare API gateway refuses webhooks and unsafe/missing origins',async()=>{
  let res=await onRequest({request:new Request('https://clinic.example/api/webhooks/%70aymongo/',{method:'POST'}),env:{API_ORIGIN,API_PROXY_SECRET}})
  assert.equal(res.status,404)
  res=await onRequest({request:new Request('https://clinic.example/api/health'),env:{}})
  assert.equal(res.status,503)
  res=await onRequest({request:new Request('https://clinic.example/api/health'),env:{API_ORIGIN:'http://localhost:3000',API_PROXY_SECRET}})
  assert.equal(res.status,503)
  res=await onRequest({request:new Request('https://clinic.example/api/health',{headers:{'CF-Connecting-IP':'198.51.100.42'}}),env:{API_ORIGIN,API_PROXY_SECRET:'short'}})
  assert.equal(res.status,503)
})
test('Cloudflare proxy preserves a streaming response', async()=>{
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: connected\n\n'));c.close()}}),{headers:{'content-type':'text/event-stream'}})
  try {
    const res=await onRequest({request:new Request('https://clinic.example/api/events/patient',{headers:{'CF-Connecting-IP':'198.51.100.42'}}),env:{API_ORIGIN,API_PROXY_SECRET}})
    assert.equal(res.headers.get('content-type'),'text/event-stream')
    assert.equal(await res.text(),'event: connected\n\n')
  } finally {globalThis.fetch=oldFetch}
})

test('Cloudflare proxy forwards each supported API method and request body', async()=>{
  const oldFetch=globalThis.fetch
  let captured
  globalThis.fetch=async(_url,options)=>{
    captured=options
    return new Response(null,{status:204})
  }
  try {
    for (const method of ['GET','POST','PUT','PATCH','DELETE']) {
      const hasBody=!['GET'].includes(method)
      const req=new Request(`https://clinic.example/api/resource?method=${method}`,{
        method,
        headers:{'CF-Connecting-IP':'198.51.100.42','Content-Type':'application/json'},
        ...(hasBody?{body:'{"sample":true}'}:{}),
      })
      await onRequest({request:req,env:{API_ORIGIN,API_PROXY_SECRET}})
      assert.equal(captured.method,method)
      assert.equal(Boolean(captured.body),hasBody)
      assert.equal(captured.headers.get('content-type'),'application/json')
    }
  } finally {globalThis.fetch=oldFetch}
})

test('Cloudflare proxy returns a bounded timeout response when Render does not answer', async()=>{
  const oldFetch=globalThis.fetch
  const oldSetTimeout=globalThis.setTimeout
  const oldClearTimeout=globalThis.clearTimeout
  globalThis.setTimeout=(callback,ms,...args)=>ms===90000?queueMicrotask(callback):oldSetTimeout(callback,ms,...args)
  globalThis.clearTimeout=()=>{}
  globalThis.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})
  })
  try {
    const res=await onRequest({request:new Request('https://clinic.example/api/health',{headers:{'CF-Connecting-IP':'198.51.100.42'}}),env:{API_ORIGIN,API_PROXY_SECRET}})
    assert.equal(res.status,504)
    assert.equal((await res.json()).code,'UPSTREAM_TIMEOUT')
  } finally {
    globalThis.fetch=oldFetch
    globalThis.setTimeout=oldSetTimeout
    globalThis.clearTimeout=oldClearTimeout
  }
})
