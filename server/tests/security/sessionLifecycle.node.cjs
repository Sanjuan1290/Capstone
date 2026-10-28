'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const jwt = require('jsonwebtoken')
const { verifySessionToken, invalidateRequestSession } = require('../../utils/sessionSecurity')
const { validatePassword } = require('../../utils/accountSecurity')
process.env.JWT_SECRET = 'synthetic-lifecycle-secret-not-a-real-session-key'
test('new passwords cannot silently exceed the bcrypt byte boundary, including Unicode', () => {
  assert.equal(validatePassword('Ab1'+'x'.repeat(69)),null)
  assert.match(validatePassword('Ab1'+'x'.repeat(69)+'suffix'),/too long/)
  assert.match(validatePassword('Ab1'+'\u00e9'.repeat(35)),/too long/)
})
const tokenFor = (role, options = {}) => jwt.sign({ id: 8, role: role === 'superadmin' ? 'admin' : role, session_version: 1 }, process.env.JWT_SECRET, { expiresIn: '1h', ...options })
for (const portal of ['patient','doctor','staff','admin','superadmin']) {
  test(`${portal} logout invalidates replayed JWTs and leaves other role sessions alone`, async () => {
    const role = portal === 'superadmin' ? 'admin' : portal
    const token = tokenFor(portal)
    let version = 1, updates = 0
    const executor = { query: async (sql, params) => {
      if (/^SELECT/.test(sql)) return [[{ id: 8, session_version: version, account_role: portal }]]
      assert.match(sql,new RegExp('^UPDATE '+({patient:'patients',doctor:'doctors',staff:'staff',admin:'admins'})[role]+' SET session_version'))
      assert.deepEqual(params,[8]); version++; updates++; return [{affectedRows:1}]
    } }
    const cookie = portal+'_token'
    assert.equal((await verifySessionToken(token,role,executor)).id,8)
    assert.equal((await invalidateRequestSession({cookies:{[cookie]:token,patient_token:tokenFor('patient')}},cookie,role,executor)).id,8)
    await assert.rejects(verifySessionToken(token,role,executor),/revoked/)
    assert.equal(await invalidateRequestSession({cookies:{[cookie]:token}},cookie,role,executor),null)
    assert.equal(updates,1)
  })
}
test('all role claims reject cross-role authentication and expired/invalid JWTs', async () => {
  const executor={query:async()=>[[{id:8,session_version:1}]]}
  for(const role of ['patient','doctor','staff','admin']) for(const expected of ['patient','doctor','staff','admin']) {
    if(role===expected)continue
    await assert.rejects(verifySessionToken(tokenFor(role),expected,executor),/role/)
  }
  await assert.rejects(verifySessionToken(tokenFor('doctor',{expiresIn:-1}),'doctor',executor),error=>error.name==='TokenExpiredError')
  await assert.rejects(verifySessionToken('invalid','doctor',executor),error=>error.name==='JsonWebTokenError')
})
test('logout cannot revoke a different admin portal and never hides a database outage', async () => {
  let updates=0
  const executor={query:async sql=>{if(/^SELECT/.test(sql))return [[{id:8,session_version:1,account_role:'superadmin'}]];updates++;return [{}]}}
  assert.equal(await invalidateRequestSession({cookies:{admin_token:tokenFor('admin')}},'admin_token','admin',executor),null)
  assert.equal(updates,0)
  await assert.rejects(invalidateRequestSession({cookies:{doctor_token:tokenFor('doctor')}},'doctor_token','doctor',{query:async()=>{throw Object.assign(Error('synthetic outage'),{code:'ECONNRESET'})}}),error=>error.code==='ECONNRESET')
  assert.equal(await invalidateRequestSession({cookies:{doctor_token:'invalid'}},'doctor_token','doctor',executor),null)
})

test('password reset consumes the token and revokes sessions in one locked transaction; failures roll back', async () => {
  for(const failing of [false,true]) {
    const commands=[]; let fail=failing
    const connection={
      beginTransaction:async()=>commands.push('begin'),commit:async()=>commands.push('commit'),rollback:async()=>commands.push('rollback'),release:()=>commands.push('release'),
      query:async(sql)=>{
        commands.push(sql)
        if(/^SELECT/.test(sql)) {assert.match(sql,/FOR UPDATE/);return [[{id:51,role:'doctor',account_id:8}]]}
        if(fail&&/^DELETE/.test(sql)){fail=false;throw Object.assign(Error('synthetic delete failure'),{code:'ECONNRESET'})}
        return [{affectedRows:1}]
      },
    }
    const db={getConnection:async()=>connection,query:async()=>{throw Error('Global executor must not be used during reset')}}
    const deps={
      '../db/connect':db, bcrypt:{hash:async()=> 'synthetic-password-hash'},
      '../utils/accountSecurity':{validatePassword:()=>null},
      '../utils/sessionSecurity':{revokeSessions:async(role,id,executor)=>{assert.equal(executor,connection);commands.push('revoke:'+role+':'+id)}},
    }
    const file=path.resolve(__dirname,'../../controllers/auth.controller.js'),mod={exports:{}}
    vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(file,'utf8')}\n})`,{},{filename:file})(name=>deps[name]||{},mod,mod.exports)
    const res={status(){return this},json(){commands.push('response');return this}}
    const pending=mod.exports.resetPassword({body:{resetToken:'synthetic-token',password:'SyntheticPassword1'}},res)
    if(failing){await assert.rejects(pending,error=>error.code==='ECONNRESET');assert.ok(commands.includes('rollback'));assert.ok(!commands.includes('commit'));assert.ok(!commands.includes('response'))}
    else{await pending;assert.ok(commands.indexOf('revoke:doctor:8')<commands.indexOf('commit'));assert.ok(commands.indexOf('commit')<commands.indexOf('response'))}
    assert.ok(commands.includes('release'))
  }
})
