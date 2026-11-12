// EXPLAIN and metadata only. Does not execute report SELECTs or apply migrations.
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
require(path.join(root, 'server/node_modules/dotenv')).config({ path: path.join(root, 'server/.env'), quiet: true })
// Verify the reservation-aware SQL as well. This changes only this verifier's
// process, never the application's saved environment or database settings.
process.env.UNIFIED_BILLING_STOCKOUT = '1'
const db = require(path.join(root, 'server/db/connect'))
const { loadSuperAdminReport } = require(path.join(root, 'server/utils/superAdminReports'))
const { ensureInventoryActivityColumns } = require(path.join(root, 'server/utils/inventoryActivity'))
async function run() {
  let count = 0
  const explainOnly = { async query(sql, params) {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Read-only verification requires SELECT')
    await db.query('EXPLAIN ' + sql, params)
    count++
    return [[]]
  } }
  for (const branchId of [null, 1]) {
    for (const section of ['overview', 'appointments', 'financial', 'services', 'inventory']) {
      await loadSuperAdminReport(explainOnly, { branchId, section, from: '2026-11-01', to: '2026-11-13', now: new Date('2026-11-13T04:00:00Z') })
    }
  }
  console.log(`Super Admin reports: ${count} SELECT statements passed MySQL EXPLAIN (all branches and branch-scoped).`)
  const routes = require(path.join(root, 'server/tests/helpers/reportRouteHarness.cjs'))(explainOnly)
  const before = count
  await routes['/analytics/all']({ query: {} }, { json: () => {} })
  await routes['/analytics/trends']({ query: {} }, { json: () => {} })
  await routes['/analytics/trends']({ query: { branch_id: '1' } }, { json: () => {} })
  console.log(`Comparison and trend routes: ${count - before} more SELECTs passed MySQL EXPLAIN.`)
  try {
    await ensureInventoryActivityColumns(db, false)
    console.log('Configured database: inventory quantity_before/quantity_after columns have the expected nullable DECIMAL(12,2) types.')
  } catch (error) {
    console.log('Configured database schema check: ' + error.message)
    console.log('No migration applied. Run the guarded migration runner on the intended deployment database before deploying stock writers.')
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => db.end().catch(() => {}))
