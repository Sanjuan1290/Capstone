const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const routes = { get: {}, post: {} }
const queryLog = []
const db = {
  async query(sql, args = []) {
    queryLog.push({ sql, args })
    if (sql.includes('FROM clinic_branches')) {
      const id = Number(args[0])
      return [[id === 1 ? { id: 1, name: 'Laguna Clinic Branch' } : undefined].filter(Boolean)]
    }
    if (sql.includes('FROM queue q')) return [[]]
    throw new Error(`Unexpected query: ${sql}`)
  },
}
const fakeRouter = {
  get(path, ...handlers) { routes.get[path] = handlers },
  post(path, ...handlers) { routes.post[path] = handlers },
}
const originalLoad = Module._load
try {
  Module._load = function (name, parent, isMain) {
    if (name === 'express') return { Router: () => fakeRouter }
    if (name === 'jsonwebtoken') return {
      sign(payload) { return Buffer.from(JSON.stringify(payload)).toString('base64url') },
      verify(token) { return JSON.parse(Buffer.from(token, 'base64url').toString()) },
    }
    if (name === '../db/connect') return db
    if (name === '../middlewares/rateLimit.middleware') return { queueDisplayLimiter: (req,res,next) => next() }
    if (name === '../utils/date') return { getTodayDateOnly: () => '2026-10-15', isClinicOpenDate: () => true }
    return originalLoad.call(this, name, parent, isMain)
  }
  require('../../routers/queue.router')
} finally { Module._load = originalLoad }

function response() {
  return {
    statusCode: 200, body: null, cookies: {}, headers: {},
    status(code) { this.statusCode=code; return this },
    json(value) { this.body=value; return this },
    cookie(key, token, opts) { this.cookies[key]={token,opts}; return this },
    clearCookie(name) { delete this.cookies[name]; return this },
    setHeader(key,val) { this.headers[key]=val; return this },
  }
}
const handle = async (method, route, req) => {
  const res = response()
  const handlers = routes[method][route]
  assert.ok(handlers, `route ${method} ${route} registered`)
  // The unlock route includes a separate rate limiter. Execute the registered handler.
  await handlers[handlers.length - 1](req, res)
  return res
}

test('queue display unlock refuses a valid PIN without a branch', async () => {
  process.env.QUEUE_DISPLAY_PIN = '654321'
  const res = await handle('post', '/display/unlock', { body: { pin: '654321' } })
  assert.equal(res.statusCode, 400)
  assert.match(res.body.message, /branch/i)
})

test('queue display unlock refuses an invalid branch', async () => {
  process.env.QUEUE_DISPLAY_PIN = '654321'
  const res = await handle('post', '/display/unlock', { body: { pin: '654321', branch_id: 2 } })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 'BRANCH_NOT_FOUND')
})

test('queue display session is HttpOnly, branch-bound, and live queue queries enforce that branch', async () => {
  process.env.QUEUE_DISPLAY_PIN = '654321'
  const res = await handle('post', '/display/unlock', { body: { pin: '654321', branch_id: 1 } })
  assert.equal(res.statusCode, 200)
  const session = res.cookies.queue_display_token
  assert.ok(session)
  assert.equal(session.opts.httpOnly, true)
  const tokenPayload = JSON.parse(Buffer.from(session.token, 'base64url').toString())
  assert.equal(tokenPayload.branch_id, 1)

  queryLog.length = 0
  const req = { cookies: { queue_display_token: session.token } }
  const liveRes = response()
  let forwarded = false
  await routes.get['/live'][0](req, liveRes, () => { forwarded = true })
  assert.equal(forwarded, true)
  await routes.get['/live'][1](req, liveRes)
  assert.equal(liveRes.statusCode, 200)
  assert.equal(liveRes.body.branch_id, 1)
  const queueQueries = queryLog.filter(entry => entry.sql.includes('FROM queue q'))
  assert.equal(queueQueries.length, 2)
  for (const {sql, args} of queueQueries) {
    assert.match(sql, /q\.branch_id\s*=\s*\?/)
    assert.equal(args[0], 1)
  }
})

