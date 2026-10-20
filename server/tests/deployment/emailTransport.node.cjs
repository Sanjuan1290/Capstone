'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { sendResendEmail } = require('../../utils/resendEmail')
const oldFetch = global.fetch
const oldKey = process.env.RESEND_API_KEY
const oldFrom = process.env.EMAIL_FROM

test('Resend-only transport posts to the HTTPS API and returns an accepted ID', async () => {
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'CARAIT Clinic <no-reply@caraitclinic.com>'
  try {
    let request
    global.fetch = async (url, opts) => {
      request = { url, opts }
      return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) }
    }
    const result = await sendResendEmail({to: 'patient@example.test', subject: 'Security Code', html: '<p>Code</p>'})
    assert.equal(result, 'email_123')
    assert.equal(request.url, 'https://api.resend.com/emails')
    assert.equal(request.opts.headers.Authorization, 'Bearer re_test_key')
    assert.deepEqual(JSON.parse(request.opts.body).to, ['patient@example.test'])
  } finally {
    global.fetch = oldFetch
    if (oldKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = oldKey
    if (oldFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = oldFrom
  }
})

test('Resend rejects unconfigured sending without calling any provider', async () => {
  const origKey = process.env.RESEND_API_KEY
  const origFrom = process.env.EMAIL_FROM
  try {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    await assert.rejects(() => sendResendEmail({to:'test@example.test',subject:'Hi',html:'test'}), /not configured/i)
  } finally {
    if (origKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = origKey
    if (origFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = origFrom
  }
})
