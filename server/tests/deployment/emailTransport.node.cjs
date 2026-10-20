'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const nodemailer = require('nodemailer')

test('patched Nodemailer remains compatible with the existing Gmail transport API', () => {
  assert.equal(typeof nodemailer.createTransport, 'function')
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  })
  assert.equal(typeof transport.sendMail, 'function')
})
