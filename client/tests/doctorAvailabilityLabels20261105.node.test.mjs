import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dayAvailabilityCounts, slotDisplayLabel, slotDisplayState } from '../src/utils/doctorAvailabilityPresentation.mjs'
const require = createRequire(import.meta.url)
const { buildSlotsForCalendarDate } = require('../../server/utils/scheduleWindows.js')
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('slot labels distinguish reserved times from elapsed and unavailable times', () => {
  assert.deepEqual(['Booked', 'Unavailable', 'Unavailable', 'Available', 'Unavailable'], [
    slotDisplayLabel({ time: '8:00 AM', state: 'booked', available: false }),
    slotDisplayLabel({ time: '8:30 AM', state: 'past', available: false }),
    slotDisplayLabel({ time: '9:00 AM', state: 'unavailable', available: false }),
    slotDisplayLabel({ time: '9:30 AM', state: 'available', available: true }),
    slotDisplayLabel({ time: '10:00 AM', available: false }),
  ])
  assert.equal(slotDisplayState({ state: 'available', available: false }), 'unavailable')
  assert.equal(slotDisplayState({ available: true }), 'available')
})

test('real scheduling slots produce Available, Booked, Unavailable presentation', () => {
  const slots = buildSlotsForCalendarDate({
    date: '2026-11-05',
    schedules: [{ day_of_week: 'Thursday', start_time: '08:00', end_time: '10:00', is_active: 1 }],
    takenSlots: ['8:30 AM'],
    nowMinutes: 8 * 60 + 10,
  })
  assert.deepEqual(slots.map(({ time }) => time), ['8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM'])
  assert.deepEqual(slots.map(slotDisplayLabel), ['Unavailable', 'Booked', 'Available', 'Available'])
  assert.deepEqual(dayAvailabilityCounts(slots), { available: 2, booked: 1, unavailable: 1 })
})

test('doctor page shows centered responsive date and time grids, readable status legend and only links available slots', () => {
  const src = read('pages/patientPage/DoctorAvailability.jsx')
  assert.match(src, /statusStyles\[displayState\]/)
  assert.match(src, /displayState === 'available' \? <NavLink/)
  assert.match(src, /dayAvailabilityCounts\(slots\)/)
  assert.match(src, /aria-label="Time slot statuses"/)
  assert.match(src, /grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3/)
  assert.match(src, /items-center justify-center/)
  assert.match(src, /No scheduled appointment times for this date/)
  assert.doesNotMatch(src, /Check Time/)
})
