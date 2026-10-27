'use strict'
// Regressions for defects confirmed during the 2026-10-22 end-to-end UAT.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// Placeholder/parameter mismatches caused the Doctor Dashboard HTTP 500 (3 '?' / 2 params)
// and a silently wrong "today" count (2 '?' / 3 params).
const literalQueries = (src) => {
  const out = []
  const pat = /\.(?:query|execute)\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*,\s*\[/gs
  let m
  while ((m = pat.exec(src))) {
    if (m[1].includes('${')) continue
    let i = pat.lastIndex, depth = 1
    while (i < src.length && depth) { if ('([{'.includes(src[i])) depth++; if (')]}'.includes(src[i])) depth--; i++ }
    const arr = src.slice(pat.lastIndex, i - 1)
    if (arr.includes('...')) continue
    let parts = 0, d = 0, cur = ''
    for (const ch of arr) { if ('([{'.includes(ch)) d++; if (')]}'.includes(ch)) d--; if (ch === ',' && d === 0) { if (cur.trim()) parts++; cur = '' } else cur += ch }
    if (cur.trim()) parts++
    out.push({ line: src.slice(0, m.index).split('\n').length, placeholders: (m[1].match(/\?/g) || []).length, params: parts })
  }
  return out
}
test('every literal SQL query binds exactly one parameter per placeholder', () => {
  const dirs = ['controllers', 'routers', 'utils', 'middlewares']
  const mismatches = []
  for (const dir of dirs) for (const file of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js'))) {
    for (const q of literalQueries(read(`${dir}/${file}`))) if (q.placeholders !== q.params) mismatches.push(`${dir}/${file}:${q.line} (${q.placeholders} ? / ${q.params} params)`)
  }
  assert.deepEqual(mismatches, [])
})

test('clinical inventory consumption logs the appointment branch (finalize returned HTTP 500)', () => {
  const src = read('controllers/doctor.controller.js')
  const body = src.slice(src.indexOf('const consumeClinicalInventory'), src.indexOf('// ── Dashboard'))
  assert.ok(body.length > 200)
  assert.doesNotMatch(body.replace(/\{\s*branchId:\s*appointment\.branch_id\s*\}/g, ''), /(?<![.\w])branchId(?!\s*:)/)
})

test('branch Daily Close returns the array contract the screens render, scoped to the branch', async () => {
  const { loadCollectionLedger } = require('../../utils/reportMetrics')
  const calls = []
  const executor = { query: async (sql, params) => { calls.push({ sql, params }); return [[
    { payment_method: 'qrph', kind: 'payment', amount: 820, ym: '2026-10' },
    { payment_method: 'cash', kind: 'payment', amount: 500, ym: '2026-10' },
  ]] } }
  const ledger = await loadCollectionLedger({ startDate: '2026-10-22', endDate: '2026-10-22', branchId: 7 }, executor)
  assert.deepEqual(calls[0].params, [7, 7, 7, '2026-10-22', '2026-10-22'])
  assert.equal((calls[0].sql.match(/br\.branch_id = \?/g) || []).length, 3)
  assert.ok(Array.isArray(ledger.byMethod))
  assert.deepEqual(ledger.byMethod.map(m => [m.payment_method, m.net]), [['qrph', 820], ['cash', 500]])
  const reads = read('routers/branchOperationalReads.js')
  assert.match(reads, /methods:ledger\.byMethod/)
  assert.doesNotMatch(reads, /cashiers:\[\]/)
})

test('branch discount presets have a GET route registered before /billing/:id', () => {
  const reads = read('routers/branchOperationalReads.js')
  const presets = reads.indexOf("reg('/billing/discount-presets'"), detail = reads.indexOf("reg('/billing/:id','billing',readBill)")
  assert.ok(presets > 0 && detail > presets)
})

test('cashier drawer expectations qualify payment columns (ambiguous column HTTP 500)', () => {
  const src = read('controllers/billingCorrections.controller.js')
  const q = src.slice(src.indexOf('const computeCashierExpectations'), src.indexOf('// Cash refunds handed out'))
  assert.doesNotMatch(q, /WHEN payment_method/)
  assert.match(q, /WHEN bp\.payment_method = 'cash' THEN bp\.amount/)
})

test('concurrent gateway settlement of an already-recorded provider payment is not flagged for review', () => {
  const src = read('routers/paymongoGateway.js')
  const block = src.slice(src.indexOf('try { receiptId = await settleThroughExistingCheckout'), src.indexOf('await db.query(`UPDATE payment_gateway_attempts SET status=\'succeeded\''))
  assert.ok(block.indexOf('idempotency_key=?') > 0 && block.indexOf('idempotency_key=?') < block.indexOf('markPaidForReview'))
})

test("branch creation treats the 'Use default setup' empty value as no source branch", () => {
  const src = read('routers/branches.router.js')
  assert.match(src, /String\(rawCopyFrom\)\.trim\(\)===''\?null/)
})

