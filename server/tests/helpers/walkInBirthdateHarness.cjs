const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { validateWalkInBirthdate } = require('../../utils/patientProfile')
const { normalizePhilippinePhone } = require('../../utils/phone')
const now = new Date('2026-11-12T04:00:00Z')
function harness(role) {
  const source = fs.readFileSync(path.resolve(__dirname, `../../controllers/${role}.controller.js`), 'utf8')
  const start = source.indexOf('const createWalkInPatient ='), end = source.indexOf(role === 'admin' ? 'const getStaff =' : 'const getPatientRecord =', start)
  const calls = [], audits = []
  const db = { query: async (sql, values) => { calls.push({ sql, values }); if (sql.startsWith('SELECT')) return [[]]; return [{ insertId: 501 }] } }
  const controller = vm.runInNewContext(source.slice(start, end) + '\ncreateWalkInPatient', { db, Date, validateWalkInBirthdate: value => validateWalkInBirthdate(value, now), normalizePhilippinePhone, NORMALIZED_PHONE_SQL: 'phone', makeTempPassword: () => 'synthetic-only', bcrypt: { hash: async () => 'synthetic-hash' }, findExistingPatientByPhone: async () => ({ existing: null }), writeAuditLog: async entry => audits.push(entry) })
  return { controller, calls, audits }
}
module.exports = { harness }
