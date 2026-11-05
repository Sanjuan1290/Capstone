import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  availableSlotsForDay, calendarDayState, monthAvailabilityRequests,
  monthDateList, monthKeyFromDate, monthSundayOffset, shiftMonth, unavailableDayReason,
} from '../src/utils/doctorAvailabilityCalendar.mjs'

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('month grid starts on Sunday and includes every real date without overflow', () => {
  const dates = monthDateList('2026-11')
  assert.equal(dates.length, 30)
  assert.equal(dates[0], '2026-11-01')
  assert.equal(dates[29], '2026-11-30')
  assert.equal(monthSundayOffset('2026-11'), 0)
  assert.equal(monthSundayOffset('2026-12'), 2)
  assert.equal(monthDateList('2028-02').length, 29)
  assert.equal(monthDateList('2027-02').length, 28)
  assert.equal(monthKeyFromDate('2026-11-05'), '2026-11')
})

test('month pagination respects old 14-day endpoint limit with no missing days', () => {
  assert.deepEqual(monthAvailabilityRequests('2026-11'), [
    { startDate: '2026-11-01', days: 14 },
    { startDate: '2026-11-15', days: 14 },
    { startDate: '2026-11-29', days: 2 },
  ])
  assert.deepEqual(monthAvailabilityRequests('2027-02').map(part => part.days), [14, 14])
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2027-01', -1), '2026-12')
})

test('calendar shows only available times and does not expose booked/unavailable slots', () => {
  const day = { slots: [
    { time: '9:00 AM', state: 'booked', available: false },
    { time: '9:30 AM', state: 'past', available: false },
    { time: '10:00 AM', state: 'available', available: true },
    { time: '10:30 AM', state: 'available', available: false },
  ] }
  assert.deepEqual(availableSlotsForDay(day).map(slot => slot.time), ['10:00 AM'])
  assert.equal(calendarDayState('2026-11-06', day, '2026-11-05'), 'available')
  assert.equal(calendarDayState('2026-11-04', day, '2026-11-05'), 'past')
})

test('blocked dates report actual doctor reason, and fully booked dates stay distinct', () => {
  const blocked = { unavailable_reason: 'Doctor on leave', slots: [] }
  const full = { unavailable_reason: null, slots: [
    { time: '9:00 AM', state: 'booked', available: false },
    { time: '9:30 AM', state: 'booked', available: false },
  ] }
  assert.equal(calendarDayState('2026-11-06', blocked, '2026-11-05'), 'blocked')
  assert.equal(unavailableDayReason('2026-11-06', blocked, '2026-11-05'), 'Doctor on leave')
  assert.equal(calendarDayState('2026-11-06', full, '2026-11-05'), 'unavailable')
  assert.match(unavailableDayReason('2026-11-06', full, '2026-11-05'), /booked/)
  assert.match(unavailableDayReason('2026-11-06', { slots: [] }, '2026-11-05'), /no scheduled clinic hours/)
  assert.match(unavailableDayReason('2026-11-04', blocked, '2026-11-05'), /passed/)
  assert.match(unavailableDayReason('2026-11-06', undefined, '2026-11-05'), /not loaded/)
})

test('doctor calendar uses branch-scoped requests and only available selected-day booking paths', () => {
  const src = read('pages/patientPage/DoctorAvailability.jsx')
  assert.match(src, /getDoctorsAvailability\(\{ branchId, startDate, days \}\)/)
  assert.match(src, /day\.unavailable_reason|unavailableDayReason\(selectedDate/)
  assert.match(src, /available\.map\(slot => <NavLink/)
  assert.match(src, /buildSlotBookingPath\(\{ branchId, doctorId: doctor\.id, clinicType, date: selectedDate, time: slot\.time \}\)/)
  assert.doesNotMatch(src, /slots\.map\(\(slot\)/)
  assert.match(src, /setRefreshVersion\(previous => previous \+ 1\)/)
  assert.match(src, /let current = true/)
})
