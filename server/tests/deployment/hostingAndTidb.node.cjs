const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createConnectionOptions } = require('../../db/connectionOptions')
const { convertDump } = require('../../scripts/prepareTidbDump')
const { argumentsOf, translateCall, runTiDBMigration, PROCEDURAL_FILES } = require('../../scripts/tidbMigrationAdapter')
const { splitMysqlMigration } = require('../../scripts/branchMigrations')
const base = path.resolve(__dirname, '../../db/migrations')
test('TiDB connection enforces 4000 and verified TLS', () => {
  const options = createConnectionOptions({ DB_PROVIDER:'tidb', DB_HOST:'x.tidbcloud.com', DB_NAME:'test', DB_USER:'root', DB_PASS:'fake' })
  assert.equal(options.port,4000)
  assert.equal(options.ssl.rejectUnauthorized,true)
  assert.equal(options.timezone,'+08:00')
  assert.throws(()=>createConnectionOptions({DB_PROVIDER:'tidb',DB_SSL:'false'}),/requires DB_SSL=true/)
  assert.throws(()=>createConnectionOptions({DB_PROVIDER:'mysql',DB_PORT:'65536'}),/valid TCP port/)
  assert.equal(createConnectionOptions({DB_PROVIDER:'mysql'}).ssl,undefined)
})
test('PayMongo remains test-only even in the production validator', () => {
  const original = process.env
  try {
    process.env={...original,NODE_ENV:'development',DB_HOST:'x',DB_USER:'u',DB_NAME:'d',JWT_SECRET:'a'.repeat(40),PAYMONGO_MODE:'live'}
    const { validateRuntimeConfig } = require('../../utils/envValidation')
    assert.throws(()=>validateRuntimeConfig({production:false}), /Only PAYMONGO_MODE=test/)
    process.env.PAYMONGO_MODE='test'
    process.env.PAYMONGO_SECRET_KEY='sk_live_fake'
    assert.throws(()=>validateRuntimeConfig({production:false}), /Only PayMongo TEST secret keys/)
  } finally {process.env=original}
})
test('historical procedural SQL can be parsed without mutating its checksum', () => {
  for (const file of ['2026-10-09-multi-branch-foundation.sql','2026-10-15-branch-ledgers.sql','2026-10-15-cashier-branch-uniqueness.sql']) {
    const src=fs.readFileSync(path.join(base,file),'utf8')
    const statements=splitMysqlMigration(src)
    assert.ok(statements.some(x=>/^CREATE PROCEDURE/i.test(x)))
    assert.ok(statements.some(x=>/^CALL/i.test(x)))
  }
  assert.deepEqual(argumentsOf('CALL carait_branch_column(\'admins\',\'account_role\', "VARCHAR(20) NOT NULL DEFAULT \'admin\'")'),['carait_branch_column',['admins','account_role',"VARCHAR(20) NOT NULL DEFAULT 'admin'"]])
})
test('TiDB adapter executes guarded CALLs without CREATE PROCEDURE',async()=>{
  const commands=[]
  const conn={query:async(sql,params)=>{
    commands.push([sql,params])
    if(/information_schema\.TABLES/i.test(sql)) return [[{n:1}]]
    if(/information_schema\.COLUMNS/i.test(sql)) return [[{n:0}]]
    if(/information_schema\.STATISTICS/i.test(sql)) return [[{n:0}]]
    return [[{n:1}]]
  }}
  await runTiDBMigration(conn,'2026-10-09-multi-branch-foundation.sql',[
    'CREATE PROCEDURE dummy() BEGIN SELECT 1; END',
    'DROP PROCEDURE IF EXISTS dummy',
    "CALL carait_branch_column('staff','branch_id','INT NOT NULL DEFAULT 1')",
  ])
  assert(commands.some(([sql])=>sql==='ALTER TABLE `staff` ADD COLUMN `branch_id` INT NOT NULL DEFAULT 1'))
  assert(!commands.some(([sql])=>/^CREATE PROCEDURE/i.test(sql)))
  await translateCall(conn,"CALL carait_branch_index('admins','idx_admin_branch','CREATE INDEX idx_admin_branch ON admins (account_role,branch_id,is_active)')")
  assert(commands.some(([sql])=>sql==='CREATE INDEX idx_admin_branch ON admins (account_role,branch_id,is_active)'))
  await assert.rejects(()=>translateCall(conn, 'CALL malicious()'),/Unrecognized/)
})
test('every registered TiDB procedural migration is translated through mocked schema metadata',async()=>{
  for (const file of PROCEDURAL_FILES) {
    const commands=[]
    const conn={query:async(sql,params)=>{
      commands.push([sql,params])
      if(/information_schema\.TABLES/i.test(sql)) return [[{n:1}]]
      if(/information_schema\.COLUMNS/i.test(sql)) return [[{n:0}]]
      if(/information_schema\.(?:STATISTICS|KEY_COLUMN_USAGE)/i.test(sql)) return [[{n:0}]]
      return [[{n:1}]]
    }}
    const statements=splitMysqlMigration(fs.readFileSync(path.join(base,file),'utf8'))
    await runTiDBMigration(conn,file,statements)
    assert(!commands.some(([sql])=>/^\s*(?:CREATE|DROP)\s+PROCEDURE\b/i.test(sql)),`${file} attempted procedure DDL`)
    assert(!commands.some(([sql])=>/^\s*CALL\b/i.test(sql)),`${file} attempted to execute a stored procedure`)
    assert(!commands.some(([sql])=>/^\s*DROP\s+TABLE\b/i.test(sql)),`${file} attempted a destructive table drop`)
  }
})
test('dump conversion removes destructive mysqldump controls and personal data by default',()=>{
  const source='-- MySQL dump\nDROP TABLE IF EXISTS `patients`;\n/*!50003 ALTER TABLE `patients` DISABLE KEYS */;\nCREATE TABLE `patients` (id int);\nLOCK TABLES `patients` WRITE;\nINSERT INTO `patients` VALUES (1);\nUNLOCK TABLES;'
  const {content,countDataStatements}=convertDump(source)
  assert.equal(countDataStatements,1)
  assert.match(content,/CREATE TABLE `patients`/)
  assert.doesNotMatch(content,/INSERT INTO `patients`/)
  assert.doesNotMatch(content,/DROP TABLE/)
  assert.doesNotMatch(content,/LOCK TABLES/)
  assert.throws(()=>convertDump(source,{includeData:true}),/requires CARAIT_ACKNOWLEDGE/)
})
