'use strict'
// Own the preview server directly so Windows shell grandchildren cannot hold
// Playwright's webServer teardown open after the last test has finished.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),dist=path.join(process.env.CARAIT_QA_SOURCE_ROOT||root,'client/dist')
// Keep the tested build stable even when npm's pretest hook rewrites dist.
const assets=new Map()
const snapshot=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())snapshot(file);else assets.set(file,fs.readFileSync(file))}}
snapshot(dist)
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname
 if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'The synthetic browser fixture did not handle this API request.'}));return}
 let file=path.resolve(dist,'.'+decodeURIComponent(pathname))
 if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return}
 if(!assets.has(file))file=path.join(dist,'index.html')
 res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream'})
 res.end(assets.get(file))
})
server.listen(0,'127.0.0.1',()=>{
 const child=spawn(process.execPath,[path.join(root,'client/node_modules/@playwright/test/cli.js'),'test','--config=../QA_REPORT/conflict-repair-2026-11-11/playwright.config.mjs',...process.argv.slice(2)],{cwd:path.join(root,'client'),env:{...process.env,NODE_ENV:'production',CARAIT_QA_EXTERNAL_PREVIEW:'true',CARAIT_QA_BROWSER_ORIGIN:`http://127.0.0.1:${server.address().port}`},stdio:'inherit',windowsHide:true})
 child.on('exit',code=>{server.close();server.closeAllConnections?.();process.exitCode=code??1})
 child.on('error',error=>{console.error(error.message);server.close();process.exitCode=1})
})
