'use strict'
// Only the synthetic instance recorded by disposable-db.cjs; no .env is loaded.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),net=require('node:net')
const mysql=require('../../server/node_modules/mysql2/promise')
const here=__dirname
const read=name=>JSON.parse(fs.readFileSync(path.join(here,name),'utf8'))
const portOpen=port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false)})})
async function main(){
 const expected=read('mysql-instance.json')
 assert.equal(expected.syntheticOnly,true);assert.equal(expected.port,33409)
 const relative=path.relative(os.tmpdir(),path.resolve(expected.base))
 assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(expected.base).startsWith('carait-qa-mysql-'))
 assert.equal(path.dirname(path.resolve(expected.data)),path.resolve(expected.base))
 const connection=await mysql.createConnection({host:'127.0.0.1',port:33409,user:'root',database:'carait_qa_20261111'})
 let version
 try{
  const [[instance]]=await connection.query('SELECT @@datadir AS data,@@port AS port,VERSION() AS version,DATABASE() AS schema_name')
  assert.equal(path.resolve(instance.data).toLowerCase(),path.resolve(expected.data).toLowerCase())
  assert.equal(Number(instance.port),33409);assert.equal(instance.schema_name,'carait_qa_20261111');version=instance.version
  const [[ledger]]=await connection.query('SELECT COUNT(*) AS n FROM schema_migrations WHERE filename=?',['2026-11-11-charge-reduction-reversal.sql'])
  assert.equal(ledger.n,1,'Guarded migration re-entry must have restored its ledger row')
  const verification=read('database-verification.json')
  verification.guardedMigrationReentryCompleted=true;verification.finalMigrationLedgerRows=ledger.n
  fs.writeFileSync(path.join(here,'database-verification.json'),JSON.stringify(verification,null,2))
  try{await connection.query('SHUTDOWN')}catch(error){if(!['PROTOCOL_CONNECTION_LOST','ECONNRESET','PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(error.code))throw error}
 }finally{connection.destroy()}
 for(let i=0;i<30&&await portOpen(33409);i++)await new Promise(resolve=>setTimeout(resolve,500))
 assert.equal(await portOpen(33409),false,'Synthetic MySQL must no longer accept connections')
 // Remove only generated copies of the supplied PDF pages, which may contain private records.
 const removed=[]
 for(let page=1;page<=5;page++){
  const filename=`reference-page-${page}.png`,target=path.resolve(here,filename)
  assert.equal(path.dirname(target),path.resolve(here))
  if(fs.existsSync(target)){fs.unlinkSync(target);removed.push(filename)}
 }
 const result={status:'PASS',syntheticOnly:true,database:'carait_qa_20261111',mysqlVersion:version,port:33409,portClosed:true,migrationLedgerVerified:true,generatedReferenceCopiesRemoved:removed,originalUserFilesModified:false,productionMutations:0,syntheticDatadirRetained:true}
 fs.writeFileSync(path.join(here,'cleanup-results.json'),JSON.stringify(result,null,2))
 console.log('Synthetic MySQL stopped; final migration ledger verified; generated PDF reference copies removed.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
