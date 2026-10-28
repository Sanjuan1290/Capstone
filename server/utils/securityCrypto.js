const crypto = require('crypto')

const makeNumericCode = () => String(crypto.randomInt(100000, 1000000))
const makeRandomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')
const hashSecret = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const timingSafeEqualHash = (plainValue, storedHash) => {
  const actual = Buffer.from(hashSecret(plainValue), 'hex')
  const expected = Buffer.from(String(storedHash || ''), 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

const makeTemporaryPassword = (length = 14) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  let password = ''
  while (password.length < length) password += alphabet[crypto.randomInt(0, alphabet.length)]
  // Guarantee the shared password policy even if randomness misses a character class.
  return `Aa1!${password}`.slice(0, Math.max(8, length))
}

module.exports = { makeNumericCode, makeRandomToken, hashSecret, timingSafeEqualHash, makeTemporaryPassword }
