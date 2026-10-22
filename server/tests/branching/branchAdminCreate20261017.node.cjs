'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.resolve(__dirname, '../../routers/branches.router.js'),'utf8')
const from = source.indexOf("router.post('/accounts/admins',requireSuper,async(req,res)=>{")
const to = source.indexOf("router.put('/accounts/admins/:adminId'",from)
assert.ok(from >= 0 && to > from, 'Branch Admin creation route must be registered')
const handlerCode = source.slice(from,to)

function harness({ existing = null, insertError = null, mailError = null, activeBranch = true, permissions = ['billing','reports'] } = {}) {
  let registered
  const events=[]
  const db={
    async query(sql,values) {
      events.push({op:'read',sql,values})
      if(sql.includes('FROM clinic_branches'))return [[activeBranch ? {id:4} : undefined]]
      if(sql.includes('FROM admins WHERE email'))return [[existing]]
      throw new Error(`Unexpected query: ${sql}`)
    },
    async getConnection(){return conn}
  }
  const conn={
    async beginTransaction(){events.push({op:'begin'})},
    async query(sql,values){
      events.push({op:'write',sql,values})
      if(sql.startsWith('INSERT INTO admins')){
        if(insertError)throw Object.assign(new Error('database error'),{code:insertError})
        return [{insertId:40}]
      }
      if(sql.startsWith('INSERT INTO admin_branch_permissions'))return [{affectedRows:1}]
      throw new Error('Unexpected write')
    },
    async commit(){events.push({op:'commit'})},
    async rollback(){events.push({op:'rollback'})},
    release(){events.push({op:'release'})}
  }
  const router={post(path,...args){registered=args.at(-1)}}
  const context={router,requireSuper:()=>{},db,permissionsFromBody:p=>p||permissions,validId:x=>Number.isInteger(Number(x))&&Number(x)>0,bcrypt:{hash:async()=> 'hashed'},makeTemporaryPassword:()=> 'unit-test-temp-secret',sendTempPassword:async()=>{events.push({op:'email'});if(mailError)throw Object.assign(new Error('SMTP unavailable'),{code:'ECONNECTION'})},audit:async()=>events.push({op:'audit'}),process:{env:{CLIENT_URL:'http://localhost:5173'}},console:{error:()=>{}},}
  vm.runInNewContext(handlerCode,context,{filename:'branches.router.js'})
  const req={body:{full_name:'Clinic Administrator',email:' admin@example.com ',phone:'0917 123 4567',branch_id:4,permissions}}
  const res={statusCode:200,status(n){this.statusCode=n;return this},json(data){this.body=JSON.parse(JSON.stringify(data));return this}}
  return {run:()=>registered(req,res),req,res,events}
}

test('branch Admin creation commits permissions and then sends one invitation', async()=>{
  const h=harness()
  await h.run()
  assert.equal(h.res.statusCode,201)
  assert.equal(h.res.body.invitation_sent,true)
  const writes=h.events.filter(e=>e.op==='write')
  assert.equal(writes.length,3)
  assert.equal(writes[0].values[1],'admin@example.com')
  assert.equal(h.events.filter(e=>e.op==='commit').length,1)
  assert.ok(h.events.findIndex(e=>e.op==='commit')<h.events.findIndex(e=>e.op==='email'))
  assert.ok(!h.events.some(e=>e.op==='rollback'))
})

test('pre-existing email returns 409 before creating an account or sending mail',async()=>{
  const h=harness({existing:{id:9}})
  await h.run()
  assert.equal(h.res.statusCode,409)
  assert.equal(h.res.body.code,'ADMIN_EMAIL_IN_USE')
  assert.ok(!h.events.some(e=>['begin','write','email'].includes(e.op)))
})

test('concurrent duplicate email race rolls back and returns 409',async()=>{
  const h=harness({insertError:'ER_DUP_ENTRY'})
  await h.run()
  assert.equal(h.res.statusCode,409)
  assert.equal(h.res.body.code,'ADMIN_EMAIL_IN_USE')
  assert.ok(h.events.some(e=>e.op==='rollback'))
  assert.ok(h.events.some(e=>e.op==='release'))
  assert.ok(!h.events.some(e=>e.op==='email'))
})

test('foreign key race returns branch-changed error with no account',async()=>{
  const h=harness({insertError:'ER_NO_REFERENCED_ROW_2'})
  await h.run()
  assert.equal(h.res.statusCode,409)
  assert.equal(h.res.body.code,'BRANCH_CHANGED')
  assert.ok(h.events.some(e=>e.op==='rollback'))
})

test('email provider failure does not pretend creation failed or undo committed account',async()=>{
  const h=harness({mailError:true})
  await h.run()
  assert.equal(h.res.statusCode,201)
  assert.equal(h.res.body.invitation_sent,false)
  assert.equal(h.events.filter(e=>e.op==='commit').length,1)
  assert.equal(h.events.filter(e=>e.op==='email').length,1)
})

test('unexpected DB errors remain observable and are not disguised as duplicate emails',async()=>{
  const h=harness({insertError:'ER_NO_SUCH_TABLE'})
  await assert.rejects(h.run(),/database error/)
  assert.ok(h.events.some(e=>e.op==='rollback'))
  assert.ok(h.events.some(e=>e.op==='release'))
})

test('inactive clinic branch produces a specific 400 and no transaction',async()=>{
  const h=harness({activeBranch:false})
  await h.run()
  assert.equal(h.res.statusCode,400)
  assert.equal(h.res.body.code,'BRANCH_NOT_ACTIVE')
  assert.ok(!h.events.some(e=>e.op==='begin'))
})

test('public navigation is responsive and routes back to anchored home sections',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../../../client/src/components/layouts/Layout.jsx'),'utf8')
  assert.match(source,/aria-label="Main navigation"/)
  assert.match(source,/aria-controls="public-mobile-navigation"/)
  assert.match(source,/location\.pathname !== '\/' \? `\/\$\{dest\}` : dest/)
  assert.match(source,/className="sticky top-0 z-50/)
  assert.ok(!source.includes('flex min-w-0 flex-1 items-center gap-2 sm:gap-3'))
})

test('frontend admin errors retain backend tracking reference and actionable title',()=>{
  const shared=fs.readFileSync(path.resolve(__dirname,'../../../client/src/pages/superAdminPage/redesign/shared.jsx'),'utf8')
  const accounts=fs.readFileSync(path.resolve(__dirname,'../../../client/src/pages/superAdminPage/redesign/Accounts.jsx'),'utf8')
  assert.match(shared,/Error reference:/)
  assert.match(accounts,/Unable to create administrator/)
})

