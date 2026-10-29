const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const originalLoad = Module._load
// Run without connecting to TiDB. Preserve production source logic.
Module._load = function (name, parent, isMain) {
  if (name === '../db/connect' && parent?.filename?.endsWith('/utils/bookingPolicy.js')) {
    return { query: async () => [[]] }
  }
  return originalLoad.apply(this, arguments)
}
const policy = require('../../utils/bookingPolicy')
Module._load = originalLoad
const keys = ['NODE_ENV', 'CARAIT_ALLOW_ZERO_BOOKING_NOTICE_FOR_TESTS', 'CARAIT_ZERO_BOOKING_NOTICE_TEST_BRANCH_IDS']
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
const set = (flag, branchIds = '', mode = 'production') => {
  process.env.NODE_ENV = mode
  process.env.CARAIT_ALLOW_ZERO_BOOKING_NOTICE_FOR_TESTS = flag
  process.env.CARAIT_ZERO_BOOKING_NOTICE_TEST_BRANCH_IDS = branchIds
}
const restore = () => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
}
process.on('exit', restore)

test('feature is disabled without flag or explicit allowlisted branch', () => {
  set('false', '1')
  assert.equal(policy.isZeroNoticeTestingEnabled(1), false)
  assert.throws(() => policy.validateBookingSettings({ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }, 1), { statusCode: 403 })
  set('true', '')
  assert.equal(policy.isZeroNoticeTestingEnabled(1), false)
  assert.throws(() => policy.validateBookingSettings({ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }, 1), { statusCode: 403 })
})

test('production allows QA notice only for explicitly named branch IDs', () => {
  set('true', '1, 3')
  assert.equal(policy.isZeroNoticeTestingEnabled(1), true)
  assert.equal(policy.isZeroNoticeTestingEnabled(3), true)
  assert.equal(policy.isZeroNoticeTestingEnabled(2), false)
  assert.equal(policy.isZeroNoticeTestingEnabled(), false)
  assert.equal(policy.withBookingTestingCapability({}, 1).zero_notice_testing_enabled, true)
  assert.equal(policy.withBookingTestingCapability({}, 2).zero_notice_testing_enabled, false)
  assert.equal(policy.withBookingTestingCapability({}).zero_notice_testing_enabled, false)
})

test('production flag alone never enables all branches or global policy', () => {
  set('true', 'all')
  assert.equal(policy.isZeroNoticeTestingEnabled(1), false)
  set('true', '1;2, not-an-id, 0, -1')
  assert.equal(policy.isZeroNoticeTestingEnabled(1), false)
  assert.equal(policy.isZeroNoticeTestingEnabled(2), false)
  assert.equal(policy.isZeroNoticeTestingEnabled(null), false)
})

test('only the allowlisted branch may validate zero notice and zero cutoff', () => {
  set('true', '12')
  const candidate = { online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }
  assert.deepEqual(policy.validateBookingSettings(candidate, 12), {
    online_min_lead_minutes: 0,
    pending_confirmation_cutoff_minutes: 0,
    booking_start_interval_minutes: 30,
  })
  assert.throws(() => policy.validateBookingSettings(candidate, 13), { statusCode: 403 })
  assert.throws(() => policy.validateBookingSettings(candidate), { statusCode: 403 })
  assert.throws(() => policy.validateBookingSettings({ ...candidate, pending_confirmation_cutoff_minutes: 60 }, 12), /cutoff must be 0/i)
})

test('other branches read a persisted zero policy as the normal 12-hour policy', () => {
  set('true', '12')
  const persisted = { online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }
  assert.equal(policy.normalizeBookingSettings(persisted, 12).online_min_lead_minutes, 0)
  assert.equal(policy.normalizeBookingSettings(persisted, 13).online_min_lead_minutes, 720)
  assert.equal(policy.normalizeBookingSettings(persisted, 13).pending_confirmation_cutoff_minutes, 60)
  assert.equal(policy.normalizeBookingSettings(persisted).online_min_lead_minutes, 720)
  set('false', '12')
  assert.equal(policy.normalizeBookingSettings(persisted, 12).online_min_lead_minutes, 720)
})

test('normal 12-hour/60-minute policy stays valid in every branch', () => {
  set('true', '12')
  assert.deepEqual(policy.validateBookingSettings({ online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60 }, 13), {
    online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60, booking_start_interval_minutes: 30,
  })
  assert.throws(() => policy.validateBookingSettings({ online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 720 }, 12), /earlier/i)
})

test('production same-day FUTURE appointments are permitted only under effective zero notice', () => {
  set('true', '12')
  const now = new Date('2026-10-29T09:00:00+08:00')
  const allowed = policy.normalizeBookingSettings({ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }, 12)
  const regular = policy.normalizeBookingSettings({ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }, 13)
  const request = { date: '2026-10-29', time: '9:30 AM', now }
  assert.equal(policy.isOnlineAppointmentStartAllowed({ ...request, minLeadMinutes: allowed.online_min_lead_minutes }), true)
  assert.equal(policy.isOnlineAppointmentStartAllowed({ ...request, minLeadMinutes: regular.online_min_lead_minutes }), false)
  assert.equal(policy.isOnlineAppointmentStartAllowed({ date: '2026-10-29', time: '8:30 AM', now, minLeadMinutes: 0 }), false)
})

test('zero cutoff expires pending request at its appointment start', () => {
  set('true', '12')
  assert.equal(policy.buildConfirmationDeadlineSql({ date: '2026-10-29', time: '3:00 PM', cutoffMinutes: 0 }), '2026-10-29 15:00:00')
})

test('branch-scoped read respects allowlist for persisted zero policy', async () => {
  set('true', '12')
  const executor = { query: async () => [[{ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }]] }
  const permitted = await policy.loadBookingSettings(executor, 12)
  const regular = await policy.loadBookingSettings(executor, 13)
  const global = await policy.loadBookingSettings(executor)
  assert.equal(permitted.online_min_lead_minutes, 0)
  assert.equal(regular.online_min_lead_minutes, 720)
  assert.equal(global.online_min_lead_minutes, 720)
})

test('global policy writer refuses zero even with QA override on a branch', async () => {
  set('true', '12')
  let writes = 0
  const executor = { query: async () => { writes++; return [{ affectedRows: 1 }] } }
  await assert.rejects(() => policy.saveBookingSettings({ online_min_lead_minutes: 0, pending_confirmation_cutoff_minutes: 0 }, { executor }), { statusCode: 403 })
  assert.equal(writes, 0)
})

test('branch endpoints pass verified req.branchId to backend validation and capability', () => {
  const base = path.resolve(__dirname, '../../routers')
  const branch = fs.readFileSync(path.join(base, 'branches.router.js'), 'utf8')
  const staff = fs.readFileSync(path.join(base, 'staff.router.js'), 'utf8')
  for (const text of [branch, staff]) {
    assert.match(text, /validateBookingSettings\(req\.body,\s*req\.branchId\)/)
    assert.match(text, /withBookingTestingCapability\([^\n]*req\.branchId\)/)
  }
})

test('staging also requires an allowlisted branch; flag cannot activate globally', () => {
  set('true', '12', 'staging')
  assert.equal(policy.isZeroNoticeTestingEnabled(12), true)
  assert.equal(policy.isZeroNoticeTestingEnabled(13), false)
  assert.equal(policy.isZeroNoticeTestingEnabled(), false)
})
