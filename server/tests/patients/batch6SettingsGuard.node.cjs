const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

test('invalid birthdate in patient settings never reaches the UPDATE query', async () => {
  const queries = []
  const db = { async query(sql, params) {
    queries.push(String(sql))
    if (/^SELECT /i.test(sql)) return [[{ id: 81, full_name: 'Test', email: 'test@example.invalid', birthdate: '2000-01-01', gender: 'Female', address: 'X' }]]
    throw Error('Write must never be attempted')
  } }
  const original = Module._load
  Module._load = function (request, ...args) {
    if (request === '../db/connect') return db
    return original.call(this, request, ...args)
  }
  let updateSettings
  try { ({ updateSettings } = require('../../utils/accountSettings')) }
  finally { Module._load = original }
  await assert.rejects(updateSettings('patient', 81, { birthdate: '2026-02-31' }), (error) => {
    assert.equal(error.statusCode, 400)
    assert.match(error.message, /valid birthdate/i)
    return true
  })
  assert.equal(queries.length, 1)
  assert.match(queries[0], /^SELECT /)
})
