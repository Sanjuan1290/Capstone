function serviceAddonsSchemaFixture(){
 const columns=new Map(),indexes=new Map([
  ['uniq_billing_records_appointment',['appointment_id']],['uniq_billing_records_consultation',['consultation_id']]
 ])
 const query=(sql,args=[])=>{
  if(args[0]==='billing_records'&&['original_bill_id','charge_key'].includes(args[1])&&sql.includes('information_schema.COLUMNS'))return [columns.has(args[1])?[columns.get(args[1])]:[]]
  if(args[0]==='billing_records'&&/^(uniq_bill_|uniq_billing_records_)/.test(args[1])&&sql.includes('information_schema.STATISTICS'))return [(indexes.get(args[1])||[]).map(COLUMN_NAME=>({COLUMN_NAME,NON_UNIQUE:0,found:1}))]
  const column=/^ALTER TABLE billing_records ADD COLUMN (original_bill_id|charge_key) /.exec(sql)
  if(column){if(columns.has(column[1]))throw Error('Repeated add-on column DDL');columns.set(column[1],column[1]==='original_bill_id'?{COLUMN_TYPE:'int',IS_NULLABLE:'YES',COLUMN_DEFAULT:null}:{COLUMN_TYPE:'varchar(100)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'visit'});return [{affectedRows:1}]}
  const index=/^ALTER TABLE billing_records ADD UNIQUE KEY (uniq_bill_\w+) \(([^)]+)\)$/.exec(sql)
  if(index){if(indexes.has(index[1]))throw Error('Repeated add-on index DDL');indexes.set(index[1],index[2].split(',').map(s=>s.trim()));return [{affectedRows:1}]}
  const drop=/^ALTER TABLE billing_records DROP INDEX (uniq_billing_records_\w+)$/.exec(sql)
  if(drop){if(!indexes.has('uniq_bill_visit_charge')||!indexes.has('uniq_bill_consultation_charge'))throw Error('Replacement keys must precede drops');indexes.delete(drop[1]);return [{affectedRows:1}]}
  return null
 }
 return {query,columns,indexes}
}
module.exports={serviceAddonsSchemaFixture}
