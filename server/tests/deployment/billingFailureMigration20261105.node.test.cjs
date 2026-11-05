const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const dirname=path.resolve(__dirname,'../../scripts'),source=fs.readFileSync(path.join(dirname,'branchMigrations.js'),'utf8')
const filename='2026-11-05-billing-failure-history.sql'
function fixture(alreadyAdded=false){
 const applied=new Map(),commands=[];let column=alreadyAdded
 const stubs={'./foundationSchema':{verifyFoundationSchema:async()=>{},ensureFoundationRekeys:async()=>{}},'./promotionMigration':{MIGRATION_FILE:'2026-10-26-batch4-selected-promotion.sql',verifyPromotionSchema:async()=>{}}}
 const module={exports:{}}
 vm.runInNewContext(source,{module,exports:module.exports,__dirname:dirname,process:{env:{}},require:id=>stubs[id]||require('node:module').createRequire(path.join(dirname,'branchMigrations.js'))(id)})
 const query=async(sql,args=[])=>{
  commands.push(sql)
  if(sql.startsWith('SELECT content_sha256')){
   if(args[0]===filename)return [[...(applied.has(filename)?[{content_sha256:applied.get(filename)}]:[])]]
   const content=fs.readFileSync(path.join(dirname,'../db/migrations',args[0]),'utf8');return [[{content_sha256:crypto.createHash('sha256').update(content).digest('hex')}]]
  }
  if(sql.includes('information_schema.COLUMNS'))return [[...(column?[{found:1}]:[])]]
  if(sql.startsWith('ALTER TABLE payment_gateway_webhook_events')){assert.equal(column,false);column=true}
  if(sql.startsWith('INSERT INTO schema_migrations'))applied.set(args[0],args[1])
  return [[]]
 }
 const connection={query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}}
 return {run:()=>module.exports.runBranchMigrations({query,getConnection:async()=>connection}),commands,applied,hasColumn:()=>column}
}
test('failure history migration adds one nullable field without touching existing records',async()=>{
 const f=fixture();await f.run();assert.equal(f.hasColumn(),true);assert.equal(f.applied.has(filename),true)
 assert.equal(f.commands.filter(q=>q.startsWith('ALTER TABLE')).length,1)
 assert.equal(f.commands.some(q=>/^(UPDATE|DELETE|DROP|TRUNCATE) /.test(q)),false)
 await f.run();assert.equal(f.commands.filter(q=>q.startsWith('ALTER TABLE')).length,1)
})
test('migration resumes when TiDB DDL succeeded before the migration record was written',async()=>{
 const f=fixture(true);await f.run();assert.equal(f.commands.some(q=>q.startsWith('ALTER TABLE')),false);assert.equal(f.applied.has(filename),true)
})
