'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const gatewaySource = fs.readFileSync(path.join(__dirname, '../../routers/paymongoGateway.js'), 'utf8')
const serverSource = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8')

function loadGateway(mode = 'test') {
  let scheduled = 0
  let sweep = null
  let checked = 0
  const db = {query: async () => { checked++; return [[]] }}
  const fakeRouter = {get(){return this},post(){return this}}
  const fakeExpress = {Router: () => fakeRouter}
  const dependencies = {
    express:fakeExpress,
    '../db/connect':db,
    '../utils/paymongoClient':{},
    '../utils/paymongoMode':{configuredMode:()=>mode,supportsMode:m=>['test','live'].includes(m)},
    '../utils/paymongoRefundVerification':{},
    '../utils/paymongoWebhookSignature':{},
    '../utils/billing':{},
    '../utils/audit':{},
    '../controllers/staff.controller':{},
    '../utils/sse':{},
  }
  const module = {exports:{}}
  vm.runInNewContext(gatewaySource, {
    module, exports:module.exports, Buffer, URL, console, Date,
    process: {env:{PAYMONGO_MODE:mode}},
    require: key => {
      if (!(key in dependencies)) throw new Error(`Unknown mocked dependency ${key}`)
      return dependencies[key]
    },
    setInterval: (fn,ms) => {scheduled++;sweep=fn;return {unref(){},intervalMs:ms}},
  }, {filename:'paymongoGateway.js'})
  return {gateway:module.exports, getScheduled:()=>scheduled, runSweep:()=>sweep?.(), getChecked:()=>checked}
}

test('PayMongo startup imports a real, exported reconciliation worker', () => {
  assert.match(serverSource, /\{\s*rawWebhook,\s*startReconciliationSweeper\s*\}\s*=\s*require\('\.\/routers\/paymongoGateway'\)/)
  assert.match(serverSource, /\bstartReconciliationSweeper\(\)/)
  const {gateway} = loadGateway()
  assert.equal(typeof gateway.startReconciliationSweeper, 'function')
  assert.equal(typeof gateway.reconcileAttempt, 'function')
})

test('test-mode worker starts only once and schedules a background sweep', async () => {
  const state = loadGateway('test')
  const first = state.gateway.startReconciliationSweeper()
  const second = state.gateway.startReconciliationSweeper()
  assert.equal(first, second)
  assert.equal(first.intervalMs, 60000)
  assert.equal(state.getScheduled(), 1)
  await state.runSweep()
  assert.equal(state.getChecked(), 1)
})

test('live worker also starts, and disabled worker does not', () => {
  const state = loadGateway('live')
  assert.equal(state.gateway.startReconciliationSweeper().intervalMs,60000)
  assert.equal(state.getScheduled(), 1)
  const off=loadGateway('')
  assert.equal(off.gateway.startReconciliationSweeper(), null)
})

