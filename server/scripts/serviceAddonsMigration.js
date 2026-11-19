'use strict'
// Resumable MySQL/TiDB DDL: validate replacements before dropping legacy keys.
async function runServiceAddonsMigration(conn, statements) {
 for (const sql of statements) {
  const column = /^ALTER TABLE billing_records ADD COLUMN (original_bill_id|charge_key) (.+)$/.exec(sql)
  if (column) {
   const [[row]] = await conn.query('SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', ['billing_records',column[1]])
   if (row) {
    const type=String(row.COLUMN_TYPE).toLowerCase().replace(/^int\(\d+\)$/,'int')
    if(column[1]==='original_bill_id' ? type!=='int'||row.IS_NULLABLE!=='YES' : type!=='varchar(100)'||row.IS_NULLABLE!=='NO'||row.COLUMN_DEFAULT!=='visit')throw new Error('Incompatible add-on billing column: '+column[1])
    continue
   }
  }
  const index=/^ALTER TABLE billing_records ADD UNIQUE KEY (\w+) \(([^)]+)\)$/.exec(sql)
  if(index){
   const [rows]=await conn.query('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',['billing_records',index[1]])
   if(rows.length){const names=index[2].split(',').map(s=>s.trim());if(rows.length!==names.length||rows.some((r,i)=>r.COLUMN_NAME!==names[i]||Number(r.NON_UNIQUE)!==0))throw new Error('Incompatible add-on billing index');continue}
  }
  const drop=/^ALTER TABLE billing_records DROP INDEX (uniq_billing_records_appointment|uniq_billing_records_consultation)$/.exec(sql)
  if(drop){const [[row]]=await conn.query('SELECT 1 AS found FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1',['billing_records',drop[1]]);if(!row)continue}
  await conn.query(sql)
 }
}
module.exports={runServiceAddonsMigration}
