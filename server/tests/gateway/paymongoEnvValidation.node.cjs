'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { validateRuntimeConfig } = require('../../utils/envValidation')

const keys = [
  'DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'TRUST_PROXY', 'PAYMONGO_MODE',
  'PAYMONGO_SECRET_KEY', 'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_WEBHOOK_SECRET', 'PAYMONGO_LIVE_ENABLED',
]
const withConfig = (overrides, run) => {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  Object.assign(process.env, {
    DB_HOST: 'qa.invalid', DB_USER: 'qa-user', DB_NAME: 'qa-database', JWT_SECRET: 'synthetic-test-secret',
    ...overrides,
  })
  try { return run() }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('valid PayMongo TEST configuration starts without warnings', () => {
  withConfig({
    PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic',
    PAYMONGO_PUBLIC_KEY: 'pk_test_synthetic', PAYMONGO_WEBHOOK_SECRET: 'whsk_synthetic',
    PAYMONGO_LIVE_ENABLED: 'false',
  }, () => assert.deepEqual(validateRuntimeConfig({ production: false }).warnings, []))
})

test('valid LIVE configuration starts with collection explicitly disabled', () => {
  withConfig({
    PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_live_synthetic',
    PAYMONGO_PUBLIC_KEY: 'pk_live_synthetic', PAYMONGO_WEBHOOK_SECRET: 'whsk_synthetic',
    PAYMONGO_LIVE_ENABLED: 'false',
  }, () => {
    const { warnings } = validateRuntimeConfig({ production: false })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /creating new live QR payments remains disabled/)
  })
})

test('valid LIVE configuration can pass validation when explicitly enabled', () => {
  withConfig({
    PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_live_synthetic',
    PAYMONGO_PUBLIC_KEY: 'pk_live_synthetic', PAYMONGO_WEBHOOK_SECRET: 'whsk_synthetic',
    PAYMONGO_LIVE_ENABLED: 'true',
  }, () => assert.deepEqual(validateRuntimeConfig({ production: false }).warnings, []))
})

test('mode/key mismatches and missing selected-mode credentials fail without echoing secrets', () => {
  withConfig({
    PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_test_do_not_echo',
    PAYMONGO_PUBLIC_KEY: 'pk_live_synthetic', PAYMONGO_WEBHOOK_SECRET: 'whsk_synthetic',
  }, () => {
    assert.throws(() => validateRuntimeConfig({ production: false }), (error) => {
      assert.match(error.message, /PAYMONGO_SECRET_KEY must match PAYMONGO_MODE=live/)
      assert.doesNotMatch(error.message, /sk_test_do_not_echo/)
      return true
    })
  })
  withConfig({ PAYMONGO_MODE: 'test', PAYMONGO_PUBLIC_KEY: 'pk_test_synthetic' }, () => {
    assert.throws(() => validateRuntimeConfig({ production: false }), /PAYMONGO_SECRET_KEY must match PAYMONGO_MODE=test/)
  })
})

test('credentialed configuration requires a mode and the live gate accepts only true or false', () => {
  withConfig({ PAYMONGO_SECRET_KEY: 'sk_live_synthetic' }, () => {
    assert.throws(() => validateRuntimeConfig({ production: false }), /PAYMONGO_MODE is required when any PayMongo credential is configured/)
  })
  for (const value of ['yes', 'TRUE']) {
    withConfig({ PAYMONGO_MODE: 'live', PAYMONGO_LIVE_ENABLED: value }, () => {
      assert.throws(() => validateRuntimeConfig({ production: false }), /PAYMONGO_LIVE_ENABLED must be true or false/)
    })
  }
  withConfig({ PAYMONGO_MODE: 'test', PAYMONGO_LIVE_ENABLED: 'true' }, () => {
    assert.throws(() => validateRuntimeConfig({ production: false }), /PAYMONGO_LIVE_ENABLED=true requires PAYMONGO_MODE=live/)
  })
})


