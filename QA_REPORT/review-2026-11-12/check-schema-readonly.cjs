// Direct SELECT-only verification; no application bootstrap or migrations.
const fs = require('node:fs'), path = require('node:path')
const dotenv = require('../../server/node_modules/dotenv')
const mysql = require('../../server/node_modules/mysql2/promise')
const { createConnectionOptions } = require('../../server/db/connectionOptions')
const root = path.resolve(__dirname, '../..')
async function main() {
  const env = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(root, 'server/.env'), 'utf8')) }
  const conn = await mysql.createConnection(createConnectionOptions({ ...env, DB_CONNECT_TIMEOUT_MS: '5000', DB_POOL_SIZE: '1' }))
  const select = async sql => {
    if (!/^SELECT\b/i.test(sql)) throw Error('Only SELECT permitted')
    const [rows] = await conn.execute(sql)
    return rows
  }
  try {
    const [database] = await select('SELECT DATABASE() AS database_name,VERSION() AS database_version')
    const tables = await select("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
    const doctorIndexes = await select("SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='doctors' ORDER BY INDEX_NAME,SEQ_IN_INDEX")
    const columns = await select("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('doctors','patients','appointments','guest_booking_access','branch_queue_display_security','inventory_movement_reasons','inventory_excel_uploads','billing_charge_adjustments') ORDER BY TABLE_NAME,ORDINAL_POSITION")
    const [doctorIdentity] = await select(`SELECT COUNT(*) AS doctor_accounts,
      SUM(prc_license IS NULL OR TRIM(prc_license)='') AS missing_prc,
      (SELECT COUNT(*) FROM (SELECT LOWER(TRIM(email)) FROM doctors WHERE email IS NOT NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(*)>1) e) AS duplicate_normalized_email_groups,
      (SELECT COUNT(*) FROM (SELECT phone FROM doctors WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*)>1) p) AS duplicate_stored_phone_groups,
      (SELECT COUNT(*) FROM (SELECT UPPER(TRIM(prc_license)) FROM doctors WHERE prc_license IS NOT NULL AND TRIM(prc_license)<>'' GROUP BY UPPER(TRIM(prc_license)) HAVING COUNT(*)>1) l) AS duplicate_normalized_prc_groups
      FROM doctors`)
    const exactUniqueIndex = column => Object.values(doctorIndexes.reduce((groups, row) => {
      ;(groups[row.INDEX_NAME] ||= []).push(row)
      return groups
    }, {})).filter(rows => rows.length === 1 && Number(rows[0].NON_UNIQUE) === 0 && rows[0].COLUMN_NAME === column && rows[0].SUB_PART === null).map(rows => rows[0].INDEX_NAME)
    const duplicatePrcGroups = await select("SELECT COUNT(*) AS records,GROUP_CONCAT(id ORDER BY id) AS doctor_ids FROM doctors WHERE prc_license IS NOT NULL AND TRIM(prc_license)<>'' GROUP BY UPPER(TRIM(prc_license)) HAVING COUNT(*)>1")
    const [ageCalculation] = await select('SELECT TIMESTAMPDIFF(YEAR,NULL,CURDATE()) AS birthdate_only_age,35 AS supplied_reported_age')
    const [movementReasonCheck] = await select('SELECT COUNT(*) AS reasons_without_exact_batch FROM inventory_movement_reasons WHERE requires_batch IS NULL OR requires_batch<>1')
    const result = { checkedAt: new Date().toISOString(), source: 'Configured local server/.env TiDB connection; no Render environment access', ...database,
      doctorIndexes, exactPhoneUniqueIndexes: exactUniqueIndex('phone'), exactPrcUniqueIndexes: exactUniqueIndex('prc_license'), doctorIdentity,
      duplicatePrcGroups, ageCalculation, movementReasonCheck, columns, tables: tables.map(row => row.TABLE_NAME), writes: 0 }
    fs.writeFileSync(path.join(__dirname, 'schema-readonly.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ database, exactPhoneUniqueIndexes: result.exactPhoneUniqueIndexes, exactPrcUniqueIndexes: result.exactPrcUniqueIndexes, doctorIdentity, duplicatePrcGroups, ageCalculation, movementReasonCheck, tables: tables.length, writes: 0 }, null, 2))
  } finally { await conn.end() }
}
main().catch(error => { console.error(JSON.stringify({ status: 'READ_ONLY_CHECK_FAILED', code: error.code || error.message, writes: 0 })); process.exitCode = 1 })
