// Read-only SQL verification for the same 20 statements executed by branch Reports.
// EXPLAIN catches missing/ambiguous columns even when all clinic tables are empty.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const collectBranchReportQueries = async () => {
  const calls = []
  const fakeDb = {
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      if (sql.includes('SELECT report_footer')) return [[{ report_footer: 'Clinic' }]]
      return [[]]
    },
  }
  const mocks = {
    '../db/connect': fakeDb,
    '../utils/reportRange': { resolveReportRange: () => ({ startDate: '2026-04-15', endDate: '2026-10-15' }) },
    '../utils/date': { getTodayDateOnly: () => '2026-10-15', addDaysDateOnly: () => '2026-11-14' },
    '../utils/audit': { writeAuditLog: async () => {} },
  }
  const source = fs.readFileSync(path.join(__dirname, '../routers/branchReports.js'), 'utf8')
  const fakeModule = { exports: {} }
  const factory = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {}, { filename: 'branchReports.js' })
  factory(name => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name]
    throw new Error(`Unexpected branch report import: ${name}`)
  }, fakeModule, fakeModule.exports)
  await fakeModule.exports.readBranchReport(
    { branchId: 1, branch: { name: 'Test Branch' }, query: {} },
    { json: () => {} },
  )
  if (calls.length !== 20) {
    throw new Error(`Expected 20 branch Reports queries, captured ${calls.length}. Review the verifier when changing report queries.`)
  }
  for (const [index, call] of calls.entries()) {
    if (!/^\s*SELECT\b/i.test(call.sql)) throw new Error(`Unexpected non-read query in Reports: ${index + 1}`)
    if ((call.sql.match(/\?/g) || []).length !== call.params.length) {
      throw new Error(`Wrong SQL placeholder count in Reports query ${index + 1}.`)
    }
  }
  return calls
}

const verifyBranchReportsSql = async db => {
  const queries = await collectBranchReportQueries()
  for (const [index, { sql, params }] of queries.entries()) {
    try {
      await db.query(`EXPLAIN ${sql}`, params)
    } catch (error) {
      const details = error.sqlMessage || error.message
      throw new Error(`Branch Reports query ${index + 1}/${queries.length} failed SQL validation (${error.code || 'SQL_ERROR'}): ${details}`, { cause: error })
    }
  }
  return queries.length
}

if (require.main === module) {
  require('dotenv').config()
  const db = require('../db/connect')
  verifyBranchReportsSql(db)
    .then(count => console.log(`Reports SQL verification passed: ${count} statements validated against MySQL without modifying data.`))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
    .finally(() => db.end().catch(() => {}))
}

module.exports = { collectBranchReportQueries, verifyBranchReportsSql }
