const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const dates = require('../../utils/date')
function harness() {
  let instant = '2026-11-12T15:59:59Z', serial = 0
  const queues = [], appointments = [], traces = [], locks = new Map()
  const services = [{id:77,branch_id:1,clinic_type:'medical',is_active:1,service_name:'Consultation',default_price:540,average_duration_minutes:45}]
  let existing = null
  const db = { async getConnection() {
    const pending = [], visits = []
    return {
      beginTransaction: async()=>{}, release:()=>{},
      commit:async()=>{queues.push(...pending.splice(0));appointments.push(...visits.splice(0))},
      rollback:async()=>{pending.length=0;visits.length=0},
      async query(sql,args=[]) {
        traces.push({sql,args})
        if (sql.includes('GET_LOCK')) {
          const previous = locks.get(args[0])
          let release; const held = new Promise(resolve=>{release=resolve})
          locks.set(args[0], {held,release})
          // Each connection retains the release function for its own acquisition.
          this.releases ||= new Map(); this.releases.set(args[0],release)
          if (previous) await previous.held
          return [[{acquired:1}]]
        }
        if (sql.includes('RELEASE_LOCK')) {this.releases.get(args[0])?.();return [[{released:1}]]}
        if (sql.includes('FROM queue q')) return [queues.filter(q=>q.patient===args[0]&&q.branch===args[1]&&q.date===args[2])]
        if (sql.includes('FROM appointments a')) return [existing?[existing]:[]]
        if (sql.includes('FROM billing_service_catalog')) return [services.filter(s=>s.id===args[0]&&s.branch_id===args[1]&&s.is_active===1)]
        if (sql.startsWith('INSERT INTO appointments')) {const id=++serial;visits.push({id,args});return [{insertId:id}]}
        if (sql.startsWith('UPDATE appointments')) return [{affectedRows:1}]
        if (sql.startsWith('SELECT id FROM queue WHERE appointment_id')) return [queues.filter(q=>q.appointment===args[0]&&q.branch===args[1])]
        if (sql.startsWith('SELECT queue_number')) {
          assert.match(sql,/type = \?.*FOR UPDATE$/)
          const rows=queues.filter(q=>q.branch===args[0]&&q.date===args[1]&&q.type===args[2]).sort((a,b)=>b.queue_number-a.queue_number)
          return [rows.slice(0,1)]
        }
        if (sql.startsWith('INSERT INTO queue')) {
          const id=++serial;pending.push({id,patient:args[0],doctor:args[1],queue_number:args[2],type:args[4],date:args[5],appointment:args[6],branch:args[7]});return [{insertId:id}]
        }
        throw Error('Unexpected SQL '+sql)
      },
    }
  }}
  const deps = {
    '../db/connect':db, './date':{getTodayDateOnly:()=>dates.getTodayDateOnly(instant),getCurrentTimeLabel:()=>dates.getCurrentTimeLabel(instant)},
    './audit':{writeAuditLog:async()=>{}}, './sse':{broadcast:()=>{}},
    './doctorAvailabilitySummary':{buildWalkInDoctorAvailability:async()=>({doctors:[{id:8,available_now:true},{id:9,available_now:true}]})},
    './bookingPolicy':{loadBookingSettings:async()=>({booking_start_interval_minutes:30}),roundReservedDurationMinutes:require('../../utils/bookingPolicy').roundReservedDurationMinutes},
  }
  const module={exports:{}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../../utils/walkIn'),'utf8'),{module,require:name=>deps[name],console})
  return {queues,appointments,services,traces,setInstant:value=>{instant=value},setExisting:value=>{existing=value},
    add:options=>module.exports.addWalkInVisit({patientId:++serial,patientName:'Synthetic',doctorId:8,clinicType:'medical',requestedServiceId:77,branchId:1,notes:'Requested care',...options})}
}
test('daily numbers span doctors, isolate departments/branches, reset at Philippine midnight, and retain old rows',async()=>{
  const h=harness()
  assert.equal((await h.add()).body.queue_number,1)
  assert.equal((await h.add({doctorId:9})).body.queue_number,2)
  h.services.push({...h.services[0],id:78,clinic_type:'derma'},{...h.services[0],branch_id:2})
  assert.equal((await h.add({clinicType:'derma',requestedServiceId:78})).body.queue_number,1)
  assert.equal((await h.add({branchId:2})).body.queue_number,1)
  h.setInstant('2026-11-12T16:00:00Z')
  assert.equal((await h.add()).body.queue_number,1)
  assert.equal(h.queues.length,5)
  assert.deepEqual(h.queues.map(q=>q.date),['2026-11-12','2026-11-12','2026-11-12','2026-11-12','2026-11-13'])
})
test('concurrent check-ins allocate consecutive numbers across doctors without duplicates',async()=>{
  const h=harness()
  const result=await Promise.all(Array.from({length:12},(_,i)=>h.add({doctorId:i%2?8:9})))
  assert.deepEqual(result.map(r=>r.body.queue_number).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+1))
})
test('new walk-in snapshots the selected branch service, price, duration and notes',async()=>{
  const h=harness();await h.add({requested_service_price_snapshot:1})
  assert.deepEqual(Array.from(h.appointments[0].args.slice(6)),[1,77,'Consultation',540,45,60,'Requested care'])
})
test('missing, inactive, foreign-branch and different-department services cannot create visits',async()=>{
  for (const variant of ['missing','inactive','foreign','department']) {
    const h=harness()
    if(variant==='inactive')h.services[0].is_active=0
    if(variant==='foreign')h.services[0].branch_id=2
    if(variant==='department')h.services[0].clinic_type='derma'
    await assert.rejects(h.add({requestedServiceId:variant==='missing'?null:77}),error=>['SERVICE_REQUIRED','SERVICE_UNAVAILABLE'].includes(error.code))
    assert.equal(h.appointments.length,0);assert.equal(h.queues.length,0)
  }
})
test('existing scheduled appointment keeps its service and its department at check-in; duplicates remain blocked',async()=>{
  const h=harness()
  h.setExisting({id:100,doctor_id:9,clinic_type:'derma',appointment_date:'2026-11-12',reason:'Saved reason'})
  const result=await h.add({patientId:50,checkInAppointmentId:100,requestedServiceId:null})
  assert.equal(result.body.checked_in_existing_appointment,true)
  assert.equal(result.body.type,'derma');assert.equal(h.appointments.length,0)
  assert.equal(h.traces.some(t=>t.sql.includes('FROM billing_service_catalog')),false)
  assert.equal((await h.add({patientId:50,checkInAppointmentId:100})).body.code,'ALREADY_IN_QUEUE')
})
