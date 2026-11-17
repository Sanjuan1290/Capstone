import test from 'node:test'
import assert from 'node:assert/strict'
import { adjacentMonth, followupDates, followupPayload, monthDays } from '../src/utils/followupCalendar.mjs'

test('calendar includes every date and correct weekday offsets, including leap years', () => {
  assert.equal(monthDays('2026-11')[0], '2026-11-01')
  assert.equal(monthDays('2026-11').filter(Boolean).length, 30)
  assert.equal(monthDays('2028-02').filter(Boolean).at(-1), '2028-02-29')
  assert.deepEqual(monthDays('2026-12').slice(0, 3), [null, null, '2026-12-01'])
  assert.equal(adjacentMonth('2026-12', 1), '2027-01')
  assert.equal(adjacentMonth('2027-01', -1), '2026-12')
})

test('multiple dates retain their own notes and serialize in calendar order', () => {
  const value = { dates: [{ return_date: '2026-12-02', doctor_note: 'Second visit' }, { return_date: '2026-11-20', doctor_note: 'First visit' }] }
  assert.deepEqual(followupPayload(value).dates, [value.dates[1], value.dates[0]])
  assert.equal(followupDates({ status: 'active', return_date: '2026-11-20', doctor_note: 'Legacy note' })[0].doctor_note, 'Legacy note')
  assert.deepEqual(followupDates({ ...value, status: 'removed' }), [])
  assert.equal(followupPayload(null), null)
})
