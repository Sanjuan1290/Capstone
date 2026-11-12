const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest')
const {harness}=require('./helpers/patientDirectoryHarness.cjs')
const cookie='superadmin_token=superadmin-session'
test('directory includes online and historical guests, preserves converted accounts and excludes walk-in-only records',async()=>{
  const h=harness(),res=await request(h.app).get('/api/superadmin/patients').set('Cookie',cookie).expect(200)
  assert.equal(res.body.pagination.total,5)
  assert.deepEqual(res.body.items.filter(row=>row.account_type==='guest').map(row=>row.id).sort(),[3,4])
  assert.equal(res.body.items.find(row=>row.id===6).account_type,'registered')
  assert.equal(res.body.items.some(row=>row.id===5),false)
  assert.deepEqual(res.body.summary,{total_patients:5,total_registered:3,total_guests:2,active_accounts:2,banned_accounts:1,total_no_shows:2})
  assert.match(res.headers['cache-control'],/no-store/)
  assert.equal(JSON.stringify(res.body).includes('synthetic-hash'),false)
  assert.ok(h.calls.every(call=>call.sql.startsWith('SELECT')))
})
test('guest, registered and account-status filters apply consistently to rows and pagination totals',async()=>{
  const expected={guest:[3,4],registered:[1,2,6],active:[1,6],banned:[2]}
  for(const [status,ids] of Object.entries(expected)){
    const h=harness(),res=await request(h.app).get('/api/superadmin/patients?status='+status).set('Cookie',cookie).expect(200)
    assert.deepEqual(res.body.items.map(row=>row.id).sort(),ids)
    assert.equal(res.body.pagination.total,ids.length)
  }
})
test('guest search works without widening email digit searches and only bound search values reach SQL',async()=>{
  const h=harness(),res=await request(h.app).get('/api/superadmin/patients?search=patient3%40example.test').set('Cookie',cookie).expect(200)
  assert.deepEqual(res.body.items.map(row=>row.id),[3])
  const search=h.calls[0]
  assert.equal(search.sql.includes('patient3@example.test'),false)
  assert.deepEqual(Array.from(search.values),Array(3).fill('%patient3@example.test%'))
})
test('guest detail and appointment history are accessible to Super Admin without exposing credentials',async()=>{
  const h=harness(),res=await request(h.app).get('/api/superadmin/patients/3').set('Cookie',cookie).expect(200)
  assert.equal(res.body.patient.account_type,'guest');assert.equal(res.body.history.total,2)
  assert.equal(res.body.history.items[0].patient_id,3)
  assert.equal(Object.hasOwn(res.body.patient,'password'),false)
  await request(h.app).get('/api/superadmin/patients/5').set('Cookie',cookie).expect(404)
  await request(h.app).get('/api/superadmin/patients/invalid').set('Cookie',cookie).expect(400)
  assert.equal(h.writes.length,0)
})
test('guest records cannot use portal ban controls and registered account session revocation still works',async()=>{
  const h=harness()
  const guest=await request(h.app).patch('/api/superadmin/patients/3/ban').set('Cookie',cookie).send({banned:true}).expect(409)
  assert.equal(guest.body.code,'GUEST_HAS_NO_PORTAL_ACCOUNT');assert.equal(h.writes.length,0)
  await request(h.app).patch('/api/superadmin/patients/1/ban').set('Cookie',cookie).send({banned:true}).expect(200)
  assert.equal(h.patients[0].is_banned,1);assert.equal(h.patients[0].session_version,2)
  assert.equal(h.audits[0].action,'patient.account_banned')
  await request(h.app).patch('/api/superadmin/patients/1/ban').set('Cookie',cookie).send({banned:false}).expect(200)
  assert.equal(h.patients[0].is_banned,0)
  await request(h.app).patch('/api/superadmin/patients/6/ban').set('Cookie',cookie).send({banned:true}).expect(200)
})
test('patient, guest and branch-admin sessions cannot access the central patient directory',async()=>{
  const h=harness()
  for(const path of ['', '/3']){
    await request(h.app).get('/api/superadmin/patients'+path).expect(401)
    await request(h.app).get('/api/superadmin/patients'+path).set('Cookie','guest_booking_phone=synthetic-proof').expect(401)
    await request(h.app).get('/api/superadmin/patients'+path).set('Cookie','patient_token=synthetic-patient').expect(401)
    await request(h.app).get('/api/superadmin/patients'+path).set('Cookie','superadmin_token=branch-admin-session').expect(403)
  }
  assert.equal(h.calls.length,0)
})
