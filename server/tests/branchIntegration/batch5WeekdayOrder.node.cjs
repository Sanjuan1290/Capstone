const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root=path.join(__dirname,'../..')
test('availability summary queries schedule rows in chronological weekday order',()=>{
  const code=fs.readFileSync(path.join(root,'utils/doctorAvailabilitySummary.js'),'utf8')
  assert.match(code,/ORDER BY doctor_id, FIELD\(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'\)/)
})
test('branch doctor schedule endpoint uses weekday order and retains doctor ownership',()=>{
  const code=fs.readFileSync(path.join(root,'routers/branches.router.js'),'utf8')
  assert.match(code,/SELECT \* FROM doctor_schedules WHERE doctor_id=\? ORDER BY FIELD\(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'\)/)
})


