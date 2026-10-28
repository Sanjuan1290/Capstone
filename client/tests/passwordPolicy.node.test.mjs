import test from 'node:test'
import assert from 'node:assert/strict'
import { getPasswordValidationError } from '../src/utils/passwordPolicy.js'
test('password policy accepts the bcrypt byte boundary but rejects ignored suffixes',()=>{
  assert.equal(getPasswordValidationError('Ab1'+'x'.repeat(69)),null)
  assert.match(getPasswordValidationError('Ab1'+'x'.repeat(69)+'suffix'),/too long/)
})
test('password policy measures Unicode bytes rather than UTF-16 character count',()=>{
  assert.match(getPasswordValidationError('Ab1'+'\u00e9'.repeat(35)),/too long/)
  assert.equal(getPasswordValidationError('Ab1'+'\u00e9'.repeat(34)),null)
})
