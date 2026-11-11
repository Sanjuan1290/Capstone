'use strict'
// Production connection: metadata reads only. Writes target a separate loopback instance.
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),mysql=require('../../server/node_modules/mysql2/promise')
const dotenv=require('../../server/node_modules/dotenv')
const {createConnectionOptions}=require('../../server/db/connectionOptions')
const out=__dirname
const id=value=>{if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value))throw Error('Invalid schema identifier');return '`'+value+'`'}
async function main(){
  let source,target
  const result={status:'BLOCKED',sourceMetadataReads:0,sourceMutations:0,applicationRowsCopied:0,isolatedDatabase:'carait_qa_20261111',tables:[]}
  try{
    const env={...process.env,...dotenv.parse(fs.readFileSync(path.join(root,'server/.env')))}
    source=await mysql.createConnection(createConnectionOptions({...env,DB_CONNECT_TIMEOUT_MS:'4000',DB_POOL_SIZE:'1'}))
    const read=async(sql,args=[])=>{if(!/^(SELECT|SHOW)\b/i.test(sql.trim()))throw Error('Metadata-only connection');result.sourceMetadataReads++;return source.query(sql,args)}
    const [tables]=await read("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
    const [columns]=await read('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION')
    const [indexes]=await read('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX')
    const [relations]=await read('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION')
    const definitions=[]
    for(const row of tables){const [[ddl]]=await read('SHOW CREATE TABLE '+id(row.TABLE_NAME));definitions.push({table:row.TABLE_NAME,ddl:ddl['Create Table'].replace(/\sAUTO_INCREMENT=\d+/g,'')})}
    fs.writeFileSync(path.join(out,'database-metadata.json'),JSON.stringify({columns,indexes,relations,definitions},null,2))
    await source.end();source=null
    target=await mysql.createConnection({host:'127.0.0.1',port:33409,user:'root',connectTimeout:3000});await target.query('CREATE DATABASE IF NOT EXISTS '+id(result.isolatedDatabase));await target.changeUser({database:result.isolatedDatabase})
    const [existing]=await target.query('SHOW TABLES')
    if(existing.length)throw Error('Isolated schema must be empty before copying structure')
    await target.query('SET FOREIGN_KEY_CHECKS=0')
    for(const item of definitions){await target.query(item.ddl);result.tables.push(item.table)}
    await target.query('SET FOREIGN_KEY_CHECKS=1')
    result.status='PASS';result.columnCount=columns.length;result.indexEntries=indexes.length
  }catch(error){result.errorCode=error.code||'SCHEMA_COPY_FAILED';result.reason=error.code?'Database metadata connection or schema copy failed (private connection details omitted).':error.message;process.exitCode=1}
  finally{await source?.end().catch(()=>{});await target?.end().catch(()=>{});fs.writeFileSync(path.join(out,'database-schema.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,tables:result.tables.length}))}
}
main()
