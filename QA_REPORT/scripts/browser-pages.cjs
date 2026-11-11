'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'QA_REPORT/evidence')
if(process.env.DB_PORT!=='33409'||process.env.DB_NAME!=='carait_qa_20261109')throw Error('Browser audit requires isolated synthetic database')
const {chromium}=require('../../client/node_modules/@playwright/test')
const parser=require('../../client/node_modules/@babel/parser')
const jwt=require('../../server/node_modules/jsonwebtoken')
const express=require('../../server/node_modules/express')
process.env.CLIENT_URL='http://127.0.0.1:4187'
const {app}=require('../../server/server'),db=require('../../server/db/connect')
const dist=path.join(root,'client/dist')
app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')))
const ast=parser.parse(fs.readFileSync(path.join(root,'client/src/App.jsx'),'utf8'),{sourceType:'module',plugins:['jsx']})
const pages=new Map()
function visit(node,parent=''){
 if(!node||typeof node!=='object')return
 let next=parent
 if(node.type==='JSXElement'&&node.openingElement.name?.name==='Route'){
  const attrs=node.openingElement.attributes,route=attrs.find(a=>a.name?.name==='path')?.value?.value
  if(route!==undefined)next=route.startsWith('/')?route:parent.replace(/\/$/,'')+'/'+route
  if(attrs.some(a=>a.name?.name==='element')&&next&&!next.includes('*')){
   const actual=next.replace(/:[A-Za-z_][\w]*/g,'1')
   const role=/^\/(superadmin|admin|staff|doctor|patient)(?:\/|$)/.exec(next)?.[1]||'public'
   pages.set(actual,{path:actual,pattern:next,role})
  }
 }
 for(const [key,value] of Object.entries(node)){
  if(['loc','start','end','comments','extra','tokens'].includes(key))continue
  if(Array.isArray(value))value.forEach(child=>visit(child,next))
  else if(value&&typeof value==='object')visit(value,next)
 }
}
visit(ast)
const results=[],screens=path.join(out,'browser-artifacts/live-pages')
fs.mkdirSync(screens,{recursive:true})
let server,browser
async function main(){
 try{
  server=await new Promise(resolve=>{const s=app.listen(4187,'127.0.0.1',()=>resolve(s))})
  const base=`http://127.0.0.1:${server.address().port}`
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})
  for(const role of ['public','patient','doctor','staff','admin','superadmin']){
   const context=await browser.newContext({viewport:{width:1440,height:1000}})
   if(role!=='public'){
    const token=jwt.sign({id:role==='admin'?2:1,role:role==='superadmin'?'admin':role,session_version:role==='patient'?5:1},process.env.JWT_SECRET,{expiresIn:'1h'})
    // Read the current synthetic session version after the ban/unban tests.
    const table=role==='patient'?'patients':role==='admin'||role==='superadmin'?'admins':role==='doctor'?'doctors':'staff'
    const [[account]]=await db.query(`SELECT session_version FROM ${table} WHERE id=?`,[role==='admin'?2:1])
    const current=jwt.sign({...jwt.decode(token),session_version:account.session_version},process.env.JWT_SECRET)
    await context.addCookies([{name:role+'_token',value:current,url:base,httpOnly:true,sameSite:'Lax'}])
   }
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
   const page=await context.newPage()
   for(const entry of pages.values()){
    if(entry.role!==role)continue
    for(const width of [1440,390]){
     const row={...entry,width,status:'NOT TESTED',errors:[],apiErrors:[]}
     const onError=error=>row.errors.push(error.message)
     const onResponse=response=>{if(response.url().includes('/api/')&&response.status()>=500)row.apiErrors.push({url:new URL(response.url()).pathname,status:response.status()})}
     page.on('pageerror',onError);page.on('response',onResponse)
     try{
      await page.setViewportSize({width,height:1000})
      await page.goto(base+entry.path,{waitUntil:'domcontentloaded',timeout:10000})
      await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 7000 })
      await page.waitForTimeout(450)
      const metrics=await page.evaluate(()=>({body:document.body.innerText,overflow:document.documentElement.scrollWidth-window.innerWidth}))
      row.finalPath=new URL(page.url()).pathname;row.bodyCharacters=metrics.body.length;row.horizontalOverflow=metrics.overflow
      if(row.errors.length||/Unexpected Application Error|Rendered (?:more|fewer) hooks|useLocation is not defined/.test(metrics.body))row.status='FAIL'
      else if(row.apiErrors.length)row.status='FAIL'
      else if(metrics.overflow>2)row.status='FAIL'
      else if(row.finalPath.includes('/login')&&!entry.path.includes('/login')){row.status='BLOCKED';row.reason='Role guard redirected to login; workflow not executed'}
      else if(metrics.body.trim().length<20){row.status='FAIL';row.reason='Page rendered almost no content'}
      else row.status='PASS'
      if(row.status==='FAIL'||/\/settings$/.test(entry.path))await page.screenshot({path:path.join(screens,`${role}-${entry.path.replace(/[^a-z0-9]/gi,'_')}-${width}.png`),fullPage:true})
     }catch(error){row.status='FAIL';row.reason=error.message.slice(0,300)}
     finally{page.off('pageerror',onError);page.off('response',onResponse)}
     results.push(row);fs.writeFileSync(path.join(out,'browser-pages-results.json'),JSON.stringify({results,scope:'Real Express + MySQL + built React; navigation/render/overflow only. Buttons and forms require separate interaction tests.',productionMutations:0},null,2))
     if(row.status!=='PASS')console.log(`${row.status} ${role} ${entry.path} width=${width} ${row.errors.join('; ')} ${row.reason||''}`)
    }
   }
   await context.close()
  }
  console.log(JSON.stringify({pages:pages.size,renders:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,blocked:results.filter(r=>r.status==='BLOCKED').length}))
 }finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await db.end()}
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
