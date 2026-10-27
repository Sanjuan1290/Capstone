'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const root = path.resolve(__dirname, '../../..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const middlewareFile = path.join(root, 'server/middlewares/auth.middleware.js')

async function simulate({ cookieName='admin_token', mustChange=1, url='/api/branches/my/legacy/dashboard' }) {
  const originalLoad = Module._load
  let lookedUp = 0
  const database = { query: async () => { lookedUp++; return [[{must_change_password:mustChange}]] } }
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === middlewareFile) {
      if (request === '../db/connect') return database
      if (request === '../utils/sessionSecurity') return {
        verifySessionToken: async () => ({ id:22, role:'admin', account_role:cookieName==='superadmin_token'?'superadmin':'admin' }),
        findAuthenticatedRequestSession: async () => null,
      }
    }
    return originalLoad.apply(this, arguments)
  }
  let middleware
  try { delete require.cache[middlewareFile]; middleware = require(middlewareFile) }
  finally { Module._load = originalLoad }
  let nextCalled = false, status, payload
  const req = { cookies:{[cookieName]:'TEST_FAKE'}, originalUrl:url, get:()=>null, ip:'127.0.0.1' }
  const res = { status(n){status=n;return this}, json(v){payload=v;return this}, clearCookie(){} }
  try { await middleware(cookieName)(req,res, err => {if(err)throw err;nextCalled=true}) }
  finally { delete require.cache[middlewareFile] }
  return { nextCalled, status, payload, lookedUp }
}

test('new Branch Admin first-login session is blocked from clinical APIs', async () => {
  const result = await simulate({ mustChange:1 })
  assert.equal(result.status,428)
  assert.equal(result.payload.code,'PASSWORD_CHANGE_REQUIRED')
  assert.equal(result.nextCalled,false)
})
test('first-login session can invoke only the required password update route', async () => {
  const result = await simulate({ mustChange:1, url:'/api/admin/security/password/required' })
  assert.equal(result.nextCalled,true)
  assert.equal(result.lookedUp,1)
})
test('existing Branch Admin with flag 0 remains operational', async () => {
  const result = await simulate({ mustChange:0 })
  assert.equal(result.nextCalled,true)
})
test('Super Admin session is not subject to Branch Admin password flag', async () => {
  const result = await simulate({ cookieName:'superadmin_token' })
  assert.equal(result.nextCalled,true)
  assert.equal(result.lookedUp,0)
})
test('first-login schema, invitation, login, password reset and UI all use the same flag', () => {
  const schema=read('server/utils/schema.js'),invitation=read('server/routers/branches.router.js')
  const accounts=read('server/controllers/admin.controller.js'),app=read('client/src/App.jsx')
  const route=read('client/src/components/AdminRoute.jsx'),required=read('server/utils/accountSecurity.js')
  const reset=read('server/controllers/auth.controller.js')
  assert.match(schema,/ensureColumn\('admins', 'must_change_password'/)
  assert.match(invitation,/is_active,must_change_password\)/)
  assert.match(accounts,/a\.must_change_password/)
  assert.match(route,/user\.must_change_password/)
  assert.match(app,/path='\/admin\/change-password-required'/)
  assert.match(required,/\['staff', 'doctor', 'admin'\]/)
  assert.match(reset,/\['staff', 'doctor', 'admin'\]/)
})
