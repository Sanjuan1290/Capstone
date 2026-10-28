'use strict'
// Real headless Chromium + built React app; every API response is synthetic.
// Uses CDP directly, with no additional package or browser installation.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const { root, out } = require('./output.cjs')
const browser = process.env.CARAIT_AUDIT_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p))
if (!browser) throw Error('No installed Chromium browser available')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'carait-audit-'))
const results = [], errors = [], external = [], writes = []
let scenario = { roles: [], consultationError: 0, saveError: null }
let releaseFinalize
let releaseUpload,uploadRequests=0
let logoutRequests=0
const consultation = { id: 41, appointment_id: 31, doctor_id: 8, patient_id: 19, branch_id: 2, patient_name: 'Synthetic Audit Patient', patient_age: 30, patient_sex: 'Female', patient_phone: '', diagnosis: 'Saved synthetic diagnosis', notes: 'Saved synthetic notes', prescription: '[]', prescription_status: 'none', status: 'draft', version: 7, type: 'medical', billing: { items: [] }, amendments: [], progress_images: [] }
const secondConsultation={...consultation,id:42,appointment_id:32,patient_id:20,patient_name:'Synthetic Second Patient',diagnosis:'Second synthetic diagnosis',version:1}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname.startsWith('/api/')) {
    const p = url.pathname
    if(p==='/api/doctor/logout'){
      logoutRequests++
      if(scenario.logoutError)return json(res,503,{message:'Synthetic revocation outage'})
      scenario.roles=[]
      return json(res,200,{message:'Logged out.'})
    }
    if (p.endsWith('/check-auth')) {
      const role = p.split('/')[2] === 'admin' && url.searchParams.get('portal') === 'superadmin' ? 'superadmin' : p.split('/')[2]
      return json(res, 200, scenario.roles.includes(role) ? { authenticated: true, user: { id: 8, full_name: 'Synthetic Audit User', account_role: role, role, clinic_type: 'medical', branch_id: 2, branch_name: 'Synthetic Branch', permissions: [], onboarding_completed_at: '2026-10-01' } } : { authenticated: false })
    }
    if (p.startsWith('/api/events/')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': synthetic audit stream\n\n'); return }
    if (p === '/api/doctor/consultations/31') return scenario.consultationError ? json(res, scenario.consultationError, { code: 'SCHEMA_MIGRATION_REQUIRED', message: 'Synthetic unavailable saved record' }) : json(res, 200, consultation)
    if(p==='/api/doctor/consultations/32')return json(res,200,secondConsultation)
    if(p==='/api/doctor/consultations/31/finalize'){
      for await(const _chunk of req){} // Consume synthetic request only.
      await new Promise(resolve=>{releaseFinalize=resolve})
      return json(res,200,{consultation_id:41,status:'finalized',billing:{items:[]}})
    }
    if(p==='/api/doctor/uploads/clinical'){
      for await(const _chunk of req){}
      uploadRequests++
      await new Promise(resolve=>{releaseUpload=resolve})
      return json(res,200,{status:'pending',asset_id:'synthetic-asset',scan_token:'synthetic-token',url:'data:image/png;base64,iVBORw0KGgo='})
    }
    if(p==='/api/doctor/uploads/clinical/status')return json(res,200,{status:'approved',secure_url:'data:image/png;base64,iVBORw0KGgo=',security_token:'synthetic-accepted-token'})
    if (p.endsWith('/draft')) {
      let body = ''; for await (const chunk of req) body += chunk
      const parsed = JSON.parse(body); writes.push(parsed)
      if (scenario.saveError) return json(res, scenario.saveError.status, { code: scenario.saveError.code, message: 'Synthetic rejected save' })
      const target=p.includes('/32/')?secondConsultation:consultation
      if(parsed.expected_version!==target.version)return json(res,409,{code:'CONSULTATION_VERSION_CONFLICT',message:'Synthetic stale version'})
      target.version++; target.diagnosis = parsed.diagnosis
      return json(res, 200, { consultation_id: target.id, consultation_version: target.version, status: 'draft', message: 'Draft saved.' })
    }
    if (p.endsWith('/notifications') || p.includes('/history') || p.includes('/billing/catalog') || p.includes('/inventory') || p.includes('/appointments') || p.includes('/promotions')) return json(res, 200, [])
    if (p.includes('profile-status')) return json(res, 200, { is_profile_complete: true, missing_fields: [] })
    return json(res, 200, {})
  }
  let file = path.resolve(root, 'client/dist', '.' + decodeURIComponent(url.pathname))
  const dist = path.resolve(root, 'client/dist') + path.sep
  if (!file.startsWith(dist)) return json(res, 403, {})
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'client/dist/index.html')
  res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(fn, label, limit = 10000) { const end = Date.now() + limit; while (Date.now() < end) { if (await fn()) return; await sleep(50) }; throw Error('Timed out: ' + label) }
let child, ws
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  await waitFor(() => fs.existsSync(portFile), 'browser debugger')
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json()
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(Error('Browser WebSocket connection timed out')),5000); ws.addEventListener('open',()=>{clearTimeout(timer);resolve()}, {once:true}); ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Browser WebSocket connection failed'))},{once:true}) })
  const pending = new Map(); let sequence = 0
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method))},5000); pending.set(id, { resolve:value=>{clearTimeout(timer);resolve(value)}, reject:error=>{clearTimeout(timer);reject(error)} }); ws.send(JSON.stringify({ id, method, params })) })
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const action = pending.get(message.id); pending.delete(message.id); if (message.error) action?.reject(Error(message.error.message)); else action?.resolve(message.result); return }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if(message.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true})
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      if (!request.url.startsWith(origin + '/') && !request.url.startsWith('data:')) { external.push(new URL(request.url).hostname); void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }) }
      else void send('Fetch.continueRequest', { requestId })
    }
  })
  await send('Runtime.enable'); await send('Page.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
  const goto = async route => { await send('Page.navigate', { url: origin + route }); await waitFor(() => evaluate('document.readyState === "complete" && document.body.innerText.length > 40'), 'page ready') }
  const check = async (name, fn) => { const start = Date.now(); try { await fn(); results.push({ name, passed: true, durationMs: Date.now()-start }); console.log('PASS', name) } catch (error) { results.push({ name, passed: false, error: error.message }); console.log('FAIL', name, error.message) } }
  await check('Superadmin session permits patient login and registration', async () => {
    scenario = { roles: ['superadmin'] }
    for (const route of ['/login', '/patient/login', '/patient/register']) { await goto(route); await waitFor(() => evaluate('!!document.querySelector("input[type=password]")'), 'patient auth form'); assert.equal(await evaluate('location.pathname'), route) }
  })
  await check('Five role portals reject an expired session on direct navigation', async () => {
    scenario = { roles: [] }
    for (const role of ['patient','doctor','staff','admin','superadmin']) { await goto('/' + role + '/settings'); await waitFor(() => evaluate(`location.pathname === '/${role}/login'`), role + ' login redirect') }
  })
  await check('Every role login remains reachable while a different role is signed in', async () => {
    for (const role of ['patient','doctor','staff','admin','superadmin']) { scenario = { roles: [role === 'superadmin' ? 'patient' : 'superadmin'] }; await goto('/' + role + '/login'); await waitFor(() => evaluate('!!document.querySelector("input[type=password]")'), role + ' login form'); assert.equal(await evaluate('location.pathname'), '/' + role + '/login') }
  })
  await check('Consultation load failure pauses editing and sends no autosave', async () => {
    scenario = { roles: ['doctor'], consultationError: 503 }
    await goto('/doctor/consultation?id=31')
    await waitFor(() => evaluate('document.body.innerText.includes("Consultation could not be loaded")'), 'load failure')
    assert.equal(await evaluate('document.querySelectorAll("textarea").length'), 0)
    const before = writes.length; await sleep(1800); assert.equal(writes.length, before)
    const screenshot=await send('Page.captureScreenshot',{format:'png'})
    fs.writeFileSync(path.join(out,'consultation-load-error-desktop.png'),Buffer.from(screenshot.data,'base64'))
  })
  await check('Retry restores the saved record and autosaves edits with successive versions', async () => {
    scenario.consultationError = 0
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Retry loading")).click()')
    await waitFor(() => evaluate('[...document.querySelectorAll("textarea")].some(e=>e.value === "Saved synthetic diagnosis")'), 'saved diagnosis')
    const edit = text => evaluate(`(()=>{const e=[...document.querySelectorAll('textarea')].find(e=>e.value.includes('diagnosis'));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    const before = writes.length
    await edit('Edited synthetic diagnosis one')
    await waitFor(() => writes.length === before + 1, 'first autosave')
    await waitFor(() => evaluate('document.body.innerText.includes("All consultation progress saved")'), 'saved indicator')
    await edit('Edited synthetic diagnosis two')
    await waitFor(() => writes.length === before + 2, 'second autosave')
    assert.deepEqual(writes.slice(before).map(v=>v.expected_version), [7,8])
  })
  await check('Schema save rejection stays dirty and stops automatic retries', async () => {
    scenario.saveError = { status: 503, code: 'SCHEMA_MIGRATION_REQUIRED' }
    await evaluate(`(()=>{const e=[...document.querySelectorAll('textarea')].find(e=>e.value.includes('diagnosis'));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Unsaved synthetic diagnosis');e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await waitFor(() => evaluate('document.body.innerText.includes("automatic retries stopped")'), 'blocked autosave')
    const before = writes.length; await sleep(3200); assert.equal(writes.length,before)
    assert.equal(await evaluate('document.body.innerText.includes("All consultation progress saved")'), false)
  })
  await check('Consultation with rejected save fits a 390px mobile viewport', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.ok(await evaluate('document.documentElement.scrollWidth <= Math.max(390, innerWidth) + 1'))
    assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll('[role=alert]')].find(e=>e.textContent.includes('Your latest consultation changes'));const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),'Rejected autosave must be visible on the consultation tab')
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    fs.writeFileSync(path.join(out,'consultation-blocked-save-mobile.png'),Buffer.from(screenshot.data,'base64'))
  })
  await check('Delayed finalization cannot mark the next patient finalized',async()=>{
    scenario={roles:['doctor']}
    await goto('/doctor/consultation?id=31')
    await waitFor(()=>evaluate('document.querySelectorAll("textarea").length>0'),'editable consultation')
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith("Prescriptions")).click()')
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Complete Consultation")).click()')
    await waitFor(()=>Boolean(releaseFinalize),'delayed finalize request')
    await evaluate('history.pushState(null,"","/doctor/consultation?id=32");window.dispatchEvent(new PopStateEvent("popstate"))')
    await waitFor(()=>evaluate('[...document.querySelectorAll("textarea")].some(e=>e.value==="Second synthetic diagnosis")'),'second patient load')
    releaseFinalize();releaseFinalize=null
    await sleep(250)
    assert.equal(await evaluate('document.body.innerText.includes("Finalized Consultation")'),false)
    assert.equal(await evaluate('[...document.querySelectorAll("textarea")].find(e=>e.value==="Second synthetic diagnosis")?.matches(":disabled")'),false)
  })
  await check('Delayed image completion and remaining files cannot attach to the next patient',async()=>{
    scenario={roles:['doctor']}
    await goto('/doctor/consultation?id=31')
    await waitFor(()=>evaluate('!!document.querySelector("input[type=file][multiple]")'),'image input')
    await evaluate(`(()=>{const transfer=new DataTransfer();for(let i=0;i<2;i++)transfer.items.add(new File([new Uint8Array([137,80,78,71])],'synthetic-'+i+'.png',{type:'image/png'}));const input=document.querySelector('input[type=file][multiple]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await waitFor(()=>Boolean(releaseUpload),'delayed image request')
    await evaluate('history.pushState(null,"","/doctor/consultation?id=32");window.dispatchEvent(new PopStateEvent("popstate"))')
    await waitFor(()=>evaluate('[...document.querySelectorAll("textarea")].some(e=>e.value==="Second synthetic diagnosis")'),'second patient after upload')
    const count=uploadRequests;releaseUpload();releaseUpload=null
    await sleep(300)
    assert.equal(uploadRequests,count,'do not start the second file for the old patient')
    assert.equal(await evaluate('document.body.innerText.includes("0/5 images")'),true)
    assert.equal(await evaluate('!!document.querySelector("img[src^=\\"data:image/png\\"]")'),false)
  })
  await check('Failed logout preserves the session and a confirmed retry sends one request',async()=>{
    scenario.logoutError=true
    const before=logoutRequests
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Logout").click()')
    await waitFor(()=>evaluate('document.body.innerText.includes("Could not log out")'),'logout error')
    assert.ok(await evaluate('location.pathname.startsWith("/doctor/consultation")'))
    assert.equal(logoutRequests,before+1)
    scenario.logoutError=false
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Logout").click()')
    await waitFor(()=>evaluate('location.pathname==="/doctor/login"'),'confirmed logout redirect')
    assert.equal(logoutRequests,before+2)
  })
  assert.equal(errors.length, 0, 'No uncaught browser exceptions')
  fs.writeFileSync(path.join(out, 'browser-smoke.json'), JSON.stringify({ api: 'Synthetic local HTTP responses; no live accounts, database or providers', browser: path.basename(browser), results, uncaughtExceptions: errors, blockedExternalHosts: [...new Set(external)], writes: writes.length },null,2)+'\n')
  if (results.some(r=>!r.passed)) process.exitCode=1
}
main().catch(error => { console.error(error.message); process.exitCode=1 }).finally(async () => {
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ id:99999,method:'Browser.close' })); await sleep(250) }
  ws?.close(); child?.kill(); server.closeAllConnections(); server.close()
  // Only remove the dedicated temporary profile created above.
  const resolved=path.resolve(profile), allowed=path.resolve(os.tmpdir())+path.sep
  if(resolved.startsWith(allowed) && path.basename(resolved).startsWith('carait-audit-')) fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100})
})
