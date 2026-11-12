const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const assert = require('node:assert/strict')
const source = fs.readFileSync(path.resolve(__dirname, '../../routers/branches.router.js'), 'utf8')
const handlerSource = source.slice(source.indexOf('const originalAppointments ='), source.indexOf('const originalPatients ='))
const bridgeDateSource = source.match(/^const bridgeDate = .+$/m)[0]
const appointments = [
  { id: 901, branch_id: 1, patient_id: 11, patient_name: 'Synthetic Guest', patient_full_name: 'Synthetic Guest', patient_phone: '639170000011', patient_email: 'guest@example.test', appointment_source: 'guest_online', appointment_date: '2026-11-13', appointment_time: '10:00 AM', time: '10:00 AM', type: 'medical', status: 'pending', doctor: 'Dr Synthetic', requested_service_name_snapshot: 'Synthetic Consultation', reason: 'Follow up' },
  { id: 902, branch_id: 2, patient_id: 12, patient_name: 'Other Branch Patient', patient_phone: '639170000012', patient_email: 'other@example.test', appointment_date: '2026-11-13' },
]
function harness() {
  const calls = []
  const db = { query: async (sql, values) => {
    assert.match(sql, /p\.phone AS patient_phone/)
    assert.match(sql, /p\.email AS patient_email/)
    assert.match(sql, /WHERE a\.branch_id=\?/)
    calls.push({ sql, values })
    return [appointments.filter(row => row.branch_id === values[0] && (!values[1] || row.appointment_date === values[1])).map(row => ({ ...row }))]
  } }
  const handler = vm.runInNewContext(`${bridgeDateSource}\n${handlerSource}\noriginalAppointments`, { db })
  return { handler, calls }
}
module.exports = { harness }
