'use strict'
// Safe to run on a local CARAIT installation: sends GET requests only.
// It never creates accounts, sends emails, changes payments, or mutates the database.
const base = (process.env.CARAIT_API_BASE || 'http://localhost:3000').replace(/\/$/,'')
const checks = [
  {path:'/api/health',statuses:[200],name:'Express health'},
  {path:'/api/ready',statuses:[200],name:'Database readiness'},
  {path:'/api/news',statuses:[200],name:'Public News & Offers'},
  {path:'/api/branches/accounts/admins',statuses:[401],name:'Admin directory rejects anonymous access'},
  {path:'/api/webhooks/paymongo',statuses:[405],name:'Webhook rejects GET'},
  {path:'/api/_carait_missing_route_test_',statuses:[404],name:'Missing API routes return JSON'},
]
async function main(){
  console.log(`CARAIT read-only preflight: ${base}`)
  let failures=0
  for(const c of checks){
    const controller=new AbortController()
    const timeout=setTimeout(()=>controller.abort(),5000)
    try{
      const response=await fetch(`${base}${c.path}`,{method:'GET',redirect:'manual',signal:controller.signal})
      const contentType=response.headers.get('content-type')||''
      let parsed
      try{parsed=await response.json()}catch{}
      const ok=c.statuses.includes(response.status)&&contentType.includes('application/json')
      console.log(`${ok?'PASS':'FAIL'} ${c.name}: HTTP ${response.status}, JSON ${contentType.includes('application/json')?'yes':'no'}${!ok&&parsed?.code?`, code ${parsed.code}`:''}`)
      if(!ok)failures++
    }catch(error){console.log(`BLOCKED ${c.name}: ${error.message}`);failures++}
    finally{clearTimeout(timeout)}
  }
  console.log(`Read-only runtime result: ${checks.length-failures}/${checks.length} passed`)
  if(failures)process.exitCode=1
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
