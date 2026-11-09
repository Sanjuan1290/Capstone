'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {runDoctorBranchMigration,runGuardedAdditiveMigration}=require('../../scripts/resumableBranchMigrations')
const {splitMysqlMigration,migrationFiles}=require('../../scripts/branchMigrations')
const {normalizeHistoricalStatement}=require('../../scripts/tidbMigrationAdapter')
const sql=name=>splitMysqlMigration(fs.readFileSync(path.join(__dirname,'../../db/migrations',name),'utf8'))

test('doctor migration backfills only missing branch assignments and replaces indexes before dropping the old key',async()=>{
 const writes=[]
 const connection={query:async(statement)=>{
  if(statement.includes('information_schema.COLUMNS'))return [[{DATA_TYPE:'int'}]]
  if(statement.includes('information_schema.STATISTICS'))return statement.startsWith('SELECT 1')?[[{found:1}]]:[[]]
  writes.push(statement);return [{affectedRows:1}]
 }}
 await runDoctorBranchMigration(connection,sql('2026-10-31-doctor-multi-branch.sql'))
 assert.equal(writes.some(s=>/ADD COLUMN branch_id/.test(s)),false)
 const backfills=writes.filter(s=>s.startsWith('UPDATE doctor_'))
 assert.equal(backfills.length,2)
 assert.ok(backfills.every(s=>/WHERE [su]\.branch_id IS NULL$/.test(s)))
 assert.ok(writes.findIndex(s=>s.includes('ADD UNIQUE KEY uniq_doctor_branch_unavailable'))<writes.findIndex(s=>s.includes('DROP INDEX uniq_doctor_unavailable_date')))
})
test('additive migrations resume partial application and use MySQL-compatible DDL',async()=>{
 const writes=[]
 const connection={query:async(statement,args)=>{
  if(statement.startsWith('SELECT'))return args[1]==='is_banned'?[[{found:1}]]:[[]]
  writes.push(statement);return [{affectedRows:1}]
 }}
 await runGuardedAdditiveMigration(connection,sql('2026-11-09-superadmin-patient-directory-ban.sql'))
 assert.equal(writes.length,3)
 assert.ok(writes.every(s=>!s.includes('IF NOT EXISTS')))
 assert.ok(writes.every(s=>!s.includes('ADD COLUMN is_banned ')))
 assert.ok(migrationFiles.includes('2026-11-09-branch-google-maps-url.sql'))
})
test('archived foundation SQL is normalized without changing its file or other statements',()=>{
 const original="INSERT INTO clinic_branches (id) SELECT id FROM clinic_settings ON DUPLICATE KEY UPDATE id = id"
 assert.equal(normalizeHistoricalStatement(original),"INSERT INTO clinic_branches (id) SELECT id FROM clinic_settings ON DUPLICATE KEY UPDATE id = clinic_branches.id")
 assert.equal(normalizeHistoricalStatement('SELECT id FROM clinic_settings'),'SELECT id FROM clinic_settings')
})
