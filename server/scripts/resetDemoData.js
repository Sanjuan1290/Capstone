#!/usr/bin/env node
// Carait Clinic demo-data reset. DRY RUN BY DEFAULT.
// This command never drops schemas or deletes setup, logins, or the clinic catalog.
// Back up the *actual target database* outside this script before using --execute.
const fs = require('fs')
const path = require('path')
let db

// Temporary visit/stock history only. Every retained master table stays untouched.
const CLEAR_TABLES = [
  'account_security_codes','appointment_reminder_deliveries','appointments',
  'audit_log_archives','audit_logs','billing_adjustment_requests',
  'billing_charge_adjustments','billing_item_batch_usage','billing_items',
  'billing_payment_refunds','billing_payments','billing_records',
  'branch_stock_transfer_requests','cashier_closing_events','cashier_closings',
  'clinical_inventory_reservations','clinic_announcement_notifications','clinic_announcements',
  'clinic_promotion_notifications','clinic_promotion_services','clinic_promotions',
  'clinic_publication_notification_jobs','consultation_amendments','consultation_images',
  'consultation_inventory_usage_batches','consultation_inventory_usage','consultations',
  'doctor_unavailable_dates','inventory_batches','inventory_excel_receipts',
  'inventory_location_batches','inventory_location_stock','inventory_logs',
  'inventory_transfer_batches','inventory_transfers',
  'marketing_campaign_recipients','marketing_campaigns','marketing_send_quota',
  'marketing_unsubscribes','notifications','password_resets','patient_consents',
  'patient_phone_verifications','patients','payment_gateway_attempts',
  'payment_gateway_webhook_events','queue','supply_request_groups','supply_requests',
]

const args = process.argv.slice(2)
const flag = key => args.includes(key)
const argValue = prefix => args.find(arg => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1)
const safeName = name => { if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Unsafe database identifier.'); return `\`${name}\`` }

// Children first, parents later. Refuse FK cycles instead of turning FK checks off.
function orderChildrenFirst(tables, rows) {
  const active = new Set(tables)
  const linked = new Map(tables.map(t => [t, new Set()]))
  for (const edge of rows) {
    if (edge.TABLE_NAME !== edge.REFERENCED_TABLE_NAME && active.has(edge.TABLE_NAME) && active.has(edge.REFERENCED_TABLE_NAME)) {
      linked.get(edge.TABLE_NAME).add(edge.REFERENCED_TABLE_NAME)
    }
  }
  const sorted = []
  while (linked.size) {
    // Simpler: a child can be deleted when no *other* remaining table references it.
    const child = [...linked.keys()].find(name => ![...linked.keys()].some(other => other !== name && linked.get(other).has(name)))
    if (!child) throw new Error('Foreign-key cycle detected. No data was changed.')
    sorted.push(child)
    linked.delete(child)
  }
  return sorted
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
  db = require('../db/connect')
  const [databaseRows] = await db.query('SELECT DATABASE() AS database_name')
  const database = databaseRows[0]?.database_name
  if (!database) throw new Error('No active database selected.')
  const [tablesRows] = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\'')
  const existing = new Set(tablesRows.map(row => row.TABLE_NAME))
  const clear = CLEAR_TABLES.filter(t => existing.has(t))
  if (clear.length < 25 || !existing.has('patients') || !existing.has('billing_records') || !existing.has('schema_migrations')) {
    throw new Error('Schema does not match the Carait Clinic baseline. Nothing changed.')
  }
  const [fkRows] = await db.query('SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL')
  const clearSet = new Set(clear)
  // A retained table with a FK pointing to erased data would be corrupted. Fail closed.
  const unsafe = fkRows.filter(({ TABLE_NAME, REFERENCED_TABLE_NAME }) => clearSet.has(REFERENCED_TABLE_NAME) && !clearSet.has(TABLE_NAME))
  if (unsafe.length) {
    throw new Error(`New retained tables reference records that would be cleared: ${[...new Set(unsafe.map(v => v.TABLE_NAME))].join(', ')}. Update the reviewed reset list first.`)
  }
  const ordered = orderChildrenFirst(clear, fkRows)
  const stockColumns = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory' AND COLUMN_NAME IN ('stock','stock_base')")
  const stockNames = stockColumns[0].map(r=>r.COLUMN_NAME)
  if (!stockNames.includes('stock')) throw new Error('Inventory stock column missing. Nothing changed.')
  const countResults = await Promise.all(clear.map(async name => {
    const [[row]] = await db.query(`SELECT COUNT(*) AS quantity FROM ${safeName(name)}`)
    return { table:name, rows:Number(row.quantity) }
  }))
  const [[inventory]] = await db.query('SELECT COUNT(*) AS items, SUM(stock) AS stock FROM inventory')
  const report = {
    database, mode:flag('--execute')?'EXECUTE REQUESTED':'DRY RUN — no changes',
    retained: ['admins','staff','staff_permissions','doctors','doctor_branch_assignments','doctor_schedules','clinic_branches','booking and branch settings','billing_service_catalog and materials','inventory item catalog','inventory_locations and suppliers','system_doctor_confirmation_notifications','schema_migrations','receipt sequence counters'],
    before: { inventory_items:Number(inventory.items||0), recorded_stock:Number(inventory.stock||0) },
    to_clear: countResults.filter(x=>x.rows>0),
    other_tables: [...existing].filter(name => !clearSet.has(name)),
    stock_columns_to_zero: stockNames,
    delete_order: ordered,
  }
  if (!flag('--execute')) {
    console.log(JSON.stringify(report,null,2))
    console.log('\nPREVIEW ONLY. Export a fresh complete SQL backup and review that all patient data is test data before executing.')
    return
  }
  const confirmation = `ERASE_DEMO_RECORDS_FROM_${database}`
  if (argValue('--database') !== database || argValue('--confirm') !== confirmation || !flag('--reviewed-all-patient-data') || String(process.env.CARAIT_ALLOW_DEMO_RESET||'') !== 'YES') {
    throw new Error(`Execution blocked. Required: CARAIT_ALLOW_DEMO_RESET=YES, --database=${database}, --confirm=${confirmation}, --reviewed-all-patient-data, and --backup=/path/to/verified-full-backup.sql`)
  }
  const backup = argValue('--backup')
  if (!backup || !fs.existsSync(path.resolve(backup))) throw new Error('Execution blocked: verified SQL backup file missing.')
  const stat = fs.statSync(path.resolve(backup))
  if (stat.size < 10_000 || Date.now() - stat.mtimeMs > 24*60*60*1000) throw new Error('Execution blocked: backup missing, too small, or older than 24 hours.')
  if (String(process.env.NODE_ENV).toLowerCase()==='production' && String(process.env.CARAIT_ALLOW_PRODUCTION_RESET||'') !== 'YES') {
    throw new Error('Execution blocked on production. Run in a separate demo database. Override requires CARAIT_ALLOW_PRODUCTION_RESET=YES.')
  }
  console.log('Reset starting for database:',database,'— backup file:',path.basename(backup))
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    for (const table of ordered) await conn.query(`DELETE FROM ${safeName(table)}`)
    await conn.query(`UPDATE inventory SET ${stockNames.map(n => `${safeName(n)}=0`).join(', ')}`)
    // Receipt and barcode sequence values are NOT reused. Settings and identities remain.
    await conn.commit()
    console.log('Reset complete. Kept setup, accounts, item catalog and receipt counters. Test stock is now zero.')
  } catch (error) {
    await conn.rollback()
    throw error
  } finally { conn.release() }
}

if (require.main === module) {
  main().catch(error => { console.error('DEMO RESET BLOCKED/FAILED:',error.message); process.exitCode=1 }).finally(()=>db?.end())
}
module.exports = { CLEAR_TABLES, orderChildrenFirst }
