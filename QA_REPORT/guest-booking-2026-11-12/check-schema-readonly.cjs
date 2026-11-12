const fs = require('node:fs'), path = require('node:path')
const dotenv = require('../../server/node_modules/dotenv'), mysql = require('../../server/node_modules/mysql2/promise')
const { createConnectionOptions } = require('../../server/db/connectionOptions')
async function main() {
  const env = { ...process.env, ...dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../server/.env'), 'utf8')) }
  const conn = await mysql.createConnection(createConnectionOptions({ ...env, DB_CONNECT_TIMEOUT_MS: '5000' }))
  try {
    const [columns] = await conn.execute("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('account_security_codes','registration_sms_limits','guest_booking_access') ORDER BY TABLE_NAME,ORDINAL_POSITION")
    const [indexes] = await conn.execute("SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('account_security_codes','registration_sms_limits','guest_booking_access') ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX")
    const groups = new Map()
    for (const row of indexes) { const key = row.TABLE_NAME + '.' + row.INDEX_NAME; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) }
    const codeUnique = [...groups.values()].some(rows => rows[0].TABLE_NAME === 'account_security_codes' && Number(rows[0].NON_UNIQUE) === 0 && rows.map(row => row.COLUMN_NAME).join(',') === 'role,account_id,purpose')
    if (!codeUnique) throw Error('Missing purpose-scoped security code unique index; existing schema must be reviewed before rollout')
    for (const table of ['account_security_codes', 'registration_sms_limits', 'guest_booking_access']) if (!columns.some(row => row.TABLE_NAME === table)) throw Error('Missing existing table: ' + table)
    const result = { status: 'PASS', securityCodesUniqueByRoleAccountPurpose: true, tablesReused: ['account_security_codes', 'registration_sms_limits', 'guest_booking_access'], columns, indexes, writes: 0 }
    fs.writeFileSync(path.join(__dirname, 'schema-readonly.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ status: result.status, securityCodesUniqueByRoleAccountPurpose: true, tablesReused: result.tablesReused, writes: 0 }))
  } finally { await conn.end() }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1 })
