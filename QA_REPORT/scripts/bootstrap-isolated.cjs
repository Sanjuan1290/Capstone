'use strict'
// Offline replay of schema metadata only. Never reads .env or connects remotely.
const fs=require('node:fs'),path=require('node:path'),mysql=require('../../server/node_modules/mysql2/promise'),bcrypt=require('../../server/node_modules/bcrypt')
const name=process.argv[2]||'carait_qa_20261109'
if(!['carait_qa_20261109','carait_qa_replay_20261109'].includes(name))throw Error('Only named disposable QA schemas are permitted')
async function main(){
 const connection=await mysql.createConnection({host:'127.0.0.1',port:33409,user:'root',password:'',connectTimeout:3000})
 try{
  const [[instance]]=await connection.query('SELECT @@datadir AS data_directory')
  const expected=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../evidence/mysql-instance.json')))
  if(path.resolve(instance.data_directory).toLowerCase()!==path.resolve(expected.data).toLowerCase())throw Error('MySQL datadir does not match the disposable instance')
  await connection.query('CREATE DATABASE IF NOT EXISTS `'+name+'`')
  await connection.changeUser({database:name})
  const [tables]=await connection.query('SHOW TABLES')
  if(tables.length)throw Error('Refusing to overwrite an existing QA schema')
  const metadata=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../evidence/database-metadata.json')))
  await connection.query('SET FOREIGN_KEY_CHECKS=0')
  for(const row of metadata.definitions){if(!/^CREATE TABLE /i.test(row.ddl))throw Error('Unexpected metadata statement');await connection.query(row.ddl)}
  await connection.query('SET FOREIGN_KEY_CHECKS=1')
  const password=await bcrypt.hash('SyntheticQa!2026',10)
  await connection.query("INSERT INTO clinic_branches (id,code,name,address,is_active) VALUES (1,'QA_ONE','Synthetic QA Branch','Synthetic QA Address',1)")
  await connection.query("INSERT INTO admins (id,full_name,email,password,account_role,is_active) VALUES (1,'Synthetic Super Admin','superadmin@qa.invalid',?,'superadmin',1)",[password])
  await connection.query("INSERT INTO clinic_settings (id,clinic_name) VALUES (1,'Synthetic Clinic')")
  console.log(JSON.stringify({status:'PASS',schema:name,tables:metadata.definitions.length,sourceConnections:0,sourceMutations:0,applicationRowsCopied:0,syntheticSeedOnly:true}))
 }finally{await connection.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
