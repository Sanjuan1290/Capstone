const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),suite=process.argv[2],targetRoot=process.argv[3]?path.resolve(process.argv[3]):root
const env={...process.env,DB_HOST:'127.0.0.1',DB_PORT:'9',DB_PROVIDER:'mysql',DB_SSL:'false',DB_SSL_CA_PATH:'',DB_NAME:'carait_isolated_qa',DB_USER:'qa',DB_PASSWORD:'qa',DB_PASS:'qa',CLOUDINARY_CLOUD_NAME:'qa-placeholder',CLOUDINARY_API_KEY:'qa-placeholder',CLOUDINARY_API_SECRET:'qa-placeholder',NODE_OPTIONS:`--require "${path.join(__dirname,'../nine-batches-2026-11-14/network-guard.cjs').replace(/\\/g,'/')}"`}
let cwd,args
if(suite==='frontend'){
 cwd=path.join(targetRoot,'client');args=['--test',...fs.readdirSync(path.join(cwd,'tests')).filter(name=>name.endsWith('.node.test.mjs')).map(name=>`tests/${name}`)]
}else if(suite==='backend-node'){cwd=path.join(targetRoot,'server');args=['scripts/runNodeRegressionTests.js']}
else if(suite==='backend-vitest'){cwd=path.join(targetRoot,'server');args=['node_modules/vitest/vitest.mjs','run','--reporter=json',`--outputFile=${path.join(__dirname,targetRoot===root?'backend-vitest.json':'baseline-vitest.json')}`]}
else throw Error('Choose frontend, backend-node or backend-vitest.')
const result=spawnSync(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true,maxBuffer:100*1024*1024})
process.exitCode=result.status??1
