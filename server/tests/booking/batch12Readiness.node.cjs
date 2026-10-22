const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
// Standalone test works without MySQL drivers because the service accepts an executor.
const original = Module._load
let booking
try {
  Module._load = function (id, parent, isMain) {
    if (id === '../db/connect' && parent?.filename?.endsWith('bookingReadiness.js')) return {}
    return original.call(this, id, parent, isMain)
  }
  booking = require('../../utils/bookingReadiness')
} finally { Module._load = original }

const fixture = (seen) => ({ query: async (sql, params) => {
  seen.push({ sql, params })
  if (sql.includes('FROM doctors d') && !sql.includes('doctor_schedules')) return [[{ clinic_type: 'medical', total: 1 }, { clinic_type: 'derma', total: 2 }]]
  if (sql.includes('doctor_schedules')) return [[{ clinic_type: 'medical', total: 1 }, { clinic_type: 'derma', total: 1 }]]
  if (sql.includes('billing_service_catalog')) return [[{ clinic_type: 'medical', total: 2 }, { clinic_type: 'all', total: 1 }]]
  if (sql.includes('appointment_reason_options')) return [[{ clinic_type: 'derma', total: 4 }, { clinic_type: 'all', total: 1 }]]
  throw new Error('Unexpected query: ' + sql)
}})

test('readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries', async () => {
  const seen = []
  const result = await booking.getOnlineBookingReadiness(fixture(seen), 7)
  assert.equal(seen.length, 4)
  assert.ok(seen.every(({ sql, params }) => sql.includes('branch_id = ?') && params.length === 1 && params[0] === 7))
  assert.ok(seen.every(({ sql }) => !sql.includes('UNION ALL') && !sql.includes('${')))
  assert.equal(result.medical.active_doctors, 1)
  assert.equal(result.medical.active_services, 3)
  assert.equal(result.medical.visit_reasons, 1)
  assert.equal(result.derma.active_services, 1)
  assert.equal(result.derma.visit_reasons, 5)
  assert.equal(result.all_bookable, true)
})

test('branch offerings explicitly disable clinic and recalculate all_bookable', async () => {
  const base = await booking.getOnlineBookingReadiness(fixture([]), 1)
  const result = booking.applyBranchBookingOfferings(base, { offers_medical: 1, offers_derma: 0 })
  assert.equal(result.medical.bookable, true)
  assert.equal(result.derma.bookable, false)
  assert.deepEqual(result.derma.issues, ['CLINIC_TYPE_DISABLED'])
  assert.match(result.derma.issue_messages[0], /not accepting online bookings/i)
  assert.equal(result.all_bookable, false)
  assert.equal(base.derma.bookable, true, 'original readiness must remain untouched')
})

test('invalid branch id is rejected before database access', async () => {
  await assert.rejects(() => booking.getOnlineBookingReadiness(fixture([]), 0), /invalid branch/i)
  await assert.rejects(() => booking.getOnlineBookingReadiness(fixture([]), '7 OR 1=1'), /invalid branch/i)
})

test('legacy organization-level readiness still works without a branch filter', async () => {
  const seen = []
  const result = await booking.getOnlineBookingReadiness(fixture(seen))
  assert.equal(result.all_bookable, true)
  assert.ok(seen.every(({ sql, params }) => !sql.includes('branch_id = ?') && params.length === 0))
})
