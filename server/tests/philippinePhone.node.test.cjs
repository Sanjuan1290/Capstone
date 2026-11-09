'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePhilippinePhone, validateBranchContact } = require('../utils/philippinePhone')

test('normalizes common Philippine mobile formats to E.164', () => {
  for (const input of ['09171234567', '0917 123 4567', '+639171234567', '+63 917 123 4567', '639171234567']) {
    assert.equal(normalizePhilippinePhone(input), '+639171234567')
  }
})

test('normalizes Philippine landline formats to E.164', () => {
  assert.equal(normalizePhilippinePhone('(02) 8123 4567'), '+63281234567')
  assert.equal(normalizePhilippinePhone('+63 46 123 4567'), '+63461234567')
})

test('allows an empty optional phone number', () => {
  assert.equal(normalizePhilippinePhone(''), null)
  assert.equal(normalizePhilippinePhone(null), null)
})

test('rejects alphabetic, short, malformed and overlong phone values', () => {
  for (const input of ['abcdefg', '0917ABC4567', '12345', '091712345678999', '++639171234567', '+09171234567', 'abc 09171234567']) {
    assert.throws(() => normalizePhilippinePhone(input), { code: 'INVALID_BRANCH_PHONE', statusCode: 400, field: 'phone' })
  }
})

test('validates email and address and returns normalized contact fields', () => {
  assert.deepEqual(validateBranchContact({
    phone: '0917 123 4567', email: '  BRANCH@EXAMPLE.COM ', address: ' Main Road, Barangay One '
  }), { phone: '+639171234567', email: 'branch@example.com', address: 'Main Road, Barangay One', google_maps_url: null })
})

test('rejects invalid email and oversized address with field-specific errors', () => {
  assert.throws(() => validateBranchContact({ email: 'not-an-email' }), { code: 'INVALID_BRANCH_EMAIL', field: 'email', statusCode: 400 })
  assert.throws(() => validateBranchContact({ address: 'x'.repeat(256) }), { code: 'INVALID_BRANCH_ADDRESS', field: 'address', statusCode: 400 })
})

test('branch router applies shared validation to create and update endpoints', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const router = fs.readFileSync(path.join(__dirname, '../routers/branches.router.js'), 'utf8')
  assert.match(router, /require\('\.\.\/utils\/philippinePhone'\)/)
  assert.match(router, /router\.post\('\/',requireSuper/)
  assert.match(router, /router\.put\('\/:branchId',requireSuper,branchContext/)
  assert.equal((router.match(/validateBranchContact\(/g) || []).length, 2)
  assert.match(router, /BRANCH_NAME_IN_USE/)
})
