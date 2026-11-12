import test from 'node:test'
import assert from 'node:assert/strict'
import { printWalkInIntakeForm } from '../src/utils/printWalkInIntakeForm.js'

test('printed walk-in intake omits civil status and retains required patient contact fields', t => {
  const previous = globalThis.window
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  let html = '', printed = false
  const popup = { document: { write: value => { html = value }, close() {} }, focus() {}, print() { printed = true } }
  globalThis.window = { open: () => popup }
  printWalkInIntakeForm()
  assert.doesNotMatch(html, /civil\s+status/i)
  for (const field of ['Full Name', 'Birthdate', 'Sex', 'Mobile Number', 'Email Address', 'Home Address']) assert.ok(html.includes(field), field)
  popup.onload()
  assert.equal(printed, true)
})
