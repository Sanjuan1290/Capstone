'use strict'
// Portable, dependency-free static route diagnostic. This intentionally fails
// on an unmatched call. Passing it cannot prove branch ownership or DB safety.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8')
const routerFiles=['branches.router.js','branchOperationalReads.js','branchReports.js','branchAudit.js','branchPromotions.js','branchAnnouncements.js','branchSystemWrites.js','branchQueueInventoryWrites.js','branchInventoryItems.js','branchCatalogWrites.js','branchAppointmentWrites.js','branchBillPreviewReads.js','branchGlobalReferenceWrites.js', 'branchPaymentSettingsWrites.js','branchSensitiveWrites.js','branchPaymentActions.js','branchCheckoutDraftWrites.js','branchBillCorrections.js','branchBatchActions.js','branchCashierAndPayment.js','paymongoGateway.js']
const methods=['GET','POST','PUT','PATCH','DELETE']
// Consume one JS template expression ${...}, including nested backtick templates.
function interpolation(str,start){
 let i=start,depth=1,quote=null,escaped=false
 for(;i<str.length;i++){
  const c=str[i]
  if(escaped){escaped=false;continue}
  if(c==='\\'){escaped=true;continue}
  if(quote){if(c===quote)quote=null;else if(quote==='`'&&c==='$'&&str[i+1]==='{'){const nested=interpolation(str,i+2);i=nested.end-1}continue}
  if(c==='\''||c==='"'||c==='`'){quote=c;continue}
  if(c==='{')depth++
  if(c==='}'&&!--depth)return {expr:str.slice(start,i),end:i+1}
 }
 throw new Error('Unbalanced interpolation while scanning a client service URL.')
}
const nestedPaths=expr=>{
 if (/^\s*reconcile\s*\?/.test(expr))return ['']
 if(/^\s*params\s*$/.test(expr))return ['']
 if(/^\s*(?:id|.*Id)\s*\?/.test(expr)||/^\s*[^?]+\?\s*`\//.test(expr)){
  const truePath=/\?\s*`(\/[^`]*)`/.exec(expr)?.[1]||'/:param'
  return ['',truePath.replace(/\$\{[^}]*\}/g,':param')]
 }
 if(/\?\s*`\?/.test(expr)||/\?\s*`\?/.test(expr)||/\?.*\?\$\{/.test(expr))return ['']
 if(/\?\s*`\?/.test(expr)||/^\s*(?:params|date|query|search)\s*\?/.test(expr))return ['']
 if(/^\s*(query|q\.toString\(\)|search\.toString\(\))\s*\?/.test(expr))return ['']
 if(/\?\s*`/.test(expr)&&/\?\$\{/.test(expr))return ['']
 return [':param']
}
function dynamicTemplate(str,at){
 // at points to the start of the first interpolation following a template tick
 const prefix='${getAdminApiBase()}'
 if(!str.startsWith(prefix,at))return null
 let i=at+prefix.length,variants=['']
 for(;i<str.length;){
  if(str[i]==='`')break
  if(str[i]==='$'&&str[i+1]==='{'){
   const {expr,end}=interpolation(str,i+2)
   variants=[...new Set(variants.flatMap(v=>nestedPaths(expr).map(add=>v+add)))];i=end;continue
  }
  variants=variants.map(v=>v+str[i]);i++
 }
 return {paths:[...new Set(variants.map(v=>v.split('?')[0].replace(/\/$/,'')||'/'))],end:i}
}
function splitServices(source){
 const positions=[...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)]
 return positions.map((m,i)=>({name:m[1],code:source.slice(m.index,positions[i+1]?.index??source.length)}))
}
function serviceCalls(){
 const source=read('client/src/services/admin.service.js'),calls=[]
 for(const {name,code} of splitServices(source)){
  let index=0
  while((index=code.indexOf('${getAdminApiBase()}',index))>=0){
   const url=dynamicTemplate(code,index);if(!url){index+=3;continue}
   // For upload URL properties, POST is the established upload helper contract.
   const before=code.slice(Math.max(0,index-100),index)
   const isUpload=/\b(?:uploadUrl|statusUrl)\s*:\s*`\s*$/.test(before)||/uploadPaymentQrToServer/.test(code.slice(0,index))
   const after=code.slice(url.end+1,url.end+280)
   const m=/^\s*,\s*\{[^}]*?\bmethod\s*:\s*([^,}\n]+)/.exec(after)
   const candidate=m?[...m[1].matchAll(/['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map(x=>x[1]):[]
   let wanted=isUpload?['POST']:/\bpostJson\s*\(\s*`\$\{getAdminApiBase\(\)\}/.test(code.slice(Math.max(0,index-20),index+25))?['POST']:candidate.length?[...new Set(candidate)]:['GET']
   // Optional suffix `${id ? `/${id}` : ''}` and conditional method match.
   if(wanted.length===2 && url.paths.length===2){
    for(const p of url.paths)calls.push({method:p.includes(':param')?(wanted.includes('PUT')?'PUT':wanted[0]):(wanted.includes('POST')?'POST':wanted[1]),path:p,functionName:name})
   }else for(const method of wanted)for(const p of url.paths)calls.push({method,path:p,functionName:name})
   index=url.end+1
  }
 }
 return [...new Map(calls.map(c=>[`${c.method} ${c.path} ${c.functionName}`,c])).values()]
}
function patterns(){
 const found=[]
 const add=(method,p,source)=>{
  if(!method||!p||!p.startsWith('/'))return
  const normalized=p.replace(/^\/my\/legacy/,'').replace(/^\/workspace\/:branchId\/legacy/,'').replace(/^\/my(?=\/)/,'').replace(/^\/workspace\/:branchId(?=\/)/,'').replace(/:[\w-]+/g,':param')||'/'
  found.push({method:method.toUpperCase(),path:normalized,source})
 }
 for(const f of routerFiles){
  const source=read('server/routers/'+f)
  for(const m of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*`\$\{prefix\}([^`]+)`/g))add(m[1],m[2],f)
  for(const m of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*`(\/(?:my|workspace)[^`]+)`/g))add(m[1],m[2].replace(/\$\{action\}/g,':param'),f)
  for(const m of source.matchAll(/\breg\(\s*['"](\/[^'"\n]+)['"]\s*,\s*['"](?:[\w_]+)['"]\s*,/g))add('GET',m[1],f)
  for(const m of source.matchAll(/\breg\(\s*['"](get|post|put|patch|delete)['"]\s*,\s*['"](\/[^'"\n]+)['"]/g))add(m[1],m[2],f)
  for(const m of source.matchAll(/\bwithSetup\(\s*['"](\/[^'"\n]+)['"]\s*,\s*['"](get|post|put|patch|delete)['"]/g))add(m[2],m[1],f)
 }
 // The gateway router is mounted on branch-scoped /billing prefixes via router.use.
 // Confirm both the mount and the endpoint exist before counting route coverage.
 const gateway = read('server/routers/paymongoGateway.js')
 const branchMount = read('server/routers/branches.router.js')
 if (branchMount.includes('require(\'./paymongoGateway\').apiRouter') && branchMount.includes('`${prefix}/billing`')) {
  if (gateway.includes("apiRouter.post('/:id/qr-payment'")) add('POST','/billing/:param/qr-payment','paymongoGateway.js')
  if (gateway.includes("apiRouter.get('/:id/qr-payment/status'")) add('GET','/billing/:param/qr-payment/status','paymongoGateway.js')
  if (gateway.includes("apiRouter.post('/:id/qr-payment/:attemptId/cancel'")) add('POST','/billing/:param/qr-payment/:param/cancel','paymongoGateway.js')
  if (gateway.includes("apiRouter.post('/:id/qr-payment/:attemptId/resolve'")) add('POST','/billing/:param/qr-payment/:param/resolve','paymongoGateway.js')
 }
 for(const a of ['confirm','cancel','no-show','reschedule'])add('PATCH',`/appointments/:param/${a}`,'branches.router.js')
 return [...new Map(found.map(r=>[`${r.method} ${r.path}`,r])).values()]
}
const match=(pattern,p)=>new RegExp('^'+pattern.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&').replace(/:param/g,'[^/]+')+'$').test(p)
function analyze(){
 const declared=patterns(),calls=serviceCalls(),missing=calls.filter(c=>!declared.some(r=>r.method===c.method&&match(r.path,c.path)))
 return {scope:'Admin service: Branch Admin and Super Admin workspace static routes only. Staff/Doctor/Patient coverage and runtime ownership require separate tests.',service_calls:calls.length,known_patterns:declared.length,unmatched:missing.length,missing:missing.map(c=>`${c.method} ${c.path} (${c.functionName})`)}
}
const output=analyze()
if(require.main===module){console.log(JSON.stringify(output,null,2));if(output.unmatched)process.exitCode=1}
module.exports={patterns,serviceCalls,analyze,output}




