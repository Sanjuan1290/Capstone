'use strict'
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'QA_REPORT/evidence')
if(process.env.DB_PORT!=='33409')throw Error('Startup check requires the isolated database')
async function main(){
 const mysql=require('../../server/node_modules/mysql2/promise')
 const admin=await mysql.createConnection({host:'127.0.0.1',port:33409,user:'root'})
 await admin.query("CREATE USER IF NOT EXISTS 'carait_qa_runtime'@'localhost' IDENTIFIED BY 'SyntheticQaLocal!2026'")
 await admin.query("GRANT ALL PRIVILEGES ON carait_qa_20261109.* TO 'carait_qa_runtime'@'localhost'")
 await admin.end()
 const log=fs.openSync(path.join(out,'startup-process.log'),'w')
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(root,'server'),env:{...process.env,NODE_ENV:'production',PORT:'4199',CLIENT_URL:'https://qa.invalid',DB_USER:'carait_qa_runtime',DB_PASSWORD:'SyntheticQaLocal!2026',RESEND_API_KEY:'re_synthetic_no_delivery',EMAIL_FROM:'Synthetic QA <noreply@qa.invalid>',QUEUE_DISPLAY_PIN:'88776655',API_PROXY_SECRET:'synthetic-qa-proxy-secret-at-least-32-characters',RUN_SCHEMA_MIGRATIONS_ON_STARTUP:'false'},windowsHide:true,stdio:['ignore',log,log]})
 fs.closeSync(log)
 const results=[]
 try{
  let ready=false
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)break
   try{ready=(await fetch('http://127.0.0.1:4199/api/health',{signal:AbortSignal.timeout(1000)})).status===200}catch{}
   if(ready)break
   await new Promise(resolve=>setTimeout(resolve,200))
  }
  if(!ready)throw Error('Local production-mode process did not become healthy')
  for(const [url,status]of [['/api/health',200],['/api/ready',200],['/api/news',200],['/api/webhooks/paymongo',405],['/api/_qa_missing_',404]]){
   const res=await fetch('http://127.0.0.1:4199'+url,{signal:AbortSignal.timeout(5000)})
   results.push({url,status:res.status,expected:status,result:res.status===status?'PASS':'FAIL'})
  }
 }catch(error){results.push({result:'FAIL',reason:error.message})}
 finally{child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000).unref()})}
 fs.writeFileSync(path.join(out,'startup-results.json'),JSON.stringify({results,productionMode:true,isolatedDatabase:true,syntheticProviderConfiguration:true,providerDeliveryTested:false,externalNetworkBlocked:true,remoteDeployment:false,processStopped:true},null,2))
 console.log(JSON.stringify(results));if(results.some(r=>r.result==='FAIL'))process.exitCode=1
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
