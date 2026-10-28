'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { assertConsultationEditable, assertConsultationVersion } = require('../../utils/consultationIntegrity')
const validation = require('../../utils/inputValidation')

const file = path.resolve(__dirname, '../../controllers/doctor.controller.js')
function controller(db, overrides = {}) {
  const deps = {
    '../db/connect': db,
    '../utils/inputValidation': validation,
    '../utils/consultationIntegrity': { assertConsultationEditable, assertConsultationVersion, loadConsultationAmendments: async () => ({}) },
    '../utils/consultationImages': { loadImagesForConsultationIds: async () => ({}) },
    '../utils/billing': { getBillingByAppointmentId: async () => null },
    '../utils/sse': { broadcast() {} },
    '../utils/audit': { writeAuditLog: async () => {} },
    ...overrides,
  }
  const mod = { exports: {} }
  vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(file, 'utf8')}\n})`, { Buffer }, { filename: file })(name => deps[name] || {}, mod, mod.exports)
  return mod.exports
}
const req = body => ({ user: { id: 8 }, branchId: 2, params: { appointmentId: 31, id: 19 }, body: { diagnosis: 'Synthetic note', ...body }, query: {} })
const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('reassigned doctor cannot read a consultation from the former branch', async () => {
  const db = { query: async (sql, params) => {
    assert.ok(sql.includes('c.branch_id = ?') && sql.includes('a.branch_id = ?'))
    assert.deepEqual([...params], [31, 8, 2, 2])
    return [[]]
  } }
  const response = res()
  await controller(db).getConsultation(req(), response)
  assert.equal(response.statusCode, 404)
  assert.equal(response.body.diagnosis, undefined)
})

test('former-branch patient relationship cannot authorize medical history', async () => {
  let calls = 0
  const db = { query: async (sql, params) => {
    calls++
    assert.ok(sql.includes('branch_id = ?'))
    assert.deepEqual([...params], [19, 8, 2])
    return [[]]
  } }
  const response = res()
  await controller(db).getPatientHistory(req(), response)
  assert.equal(response.statusCode, 403)
  assert.equal(calls, 1)
})

for (const operation of ['uploadClinicalImage', 'getClinicalUploadScanStatus']) {
  test(`${operation} rejects a former-branch appointment before accessing Cloudinary`, async () => {
    const db = { query: async (sql, params) => {
      assert.ok(sql.includes('branch_id = ?'))
      assert.deepEqual([...params], [31, 8, 2])
      return [[]]
    } }
    const request = req({ appointment_id: 31, asset_id: 'synthetic', scan_token: 'synthetic' })
    request.query = { appointment_id: '31' }
    const response = res()
    await controller(db)[operation](request, response)
    assert.equal(response.statusCode, 403)
  })
}

test('legacy clinical edit waits for the appointment lock and rejects a newly finalized record', async () => {
  let release, state = 'draft', updates = 0, rollbacks = 0, released = 0
  const gate = new Promise(resolve => { release = resolve })
  const conn = {
    beginTransaction: async () => {}, commit: async () => {},
    rollback: async () => { rollbacks++ }, release: () => { released++ },
    query: async sql => {
      if (/FROM appointments/.test(sql)) { assert.match(sql, /FOR UPDATE/); await gate; return [[{ id: 31, patient_id: 19, branch_id: 2 }]] }
      if (/FROM consultations/.test(sql)) { assert.match(sql, /FOR UPDATE/); return [[{ id: 41, status: state, version: 3 }]] }
      if (/UPDATE consultations/.test(sql)) { updates++; return [{ affectedRows: 1 }] }
      throw Error('Unexpected query in synthetic edit')
    },
  }
  const pending = controller({ getConnection: async () => conn }).updateConsultation(req(), res())
  await tick()
  assert.equal(updates, 0)
  state = 'finalized'
  release()
  await assert.rejects(pending, error => error.code === 'CONSULTATION_FINALIZED')
  assert.equal(updates, 0)
  assert.equal(rollbacks, 1)
  assert.equal(released, 1)
})

test('draft commits a version, rejects a stale writer, and rolls back a database failure', async () => {
  let saved = null, updates = 0, commits = 0, rollbacks = 0, releases = 0, fail = false
  const conn = {
    beginTransaction: async () => {}, commit: async () => { commits++ },
    rollback: async () => { rollbacks++ }, release: () => { releases++ },
    query: async sql => {
      if (/FROM appointments/.test(sql)) return [[{ id: 31, patient_id: 19, branch_id: 2, status: 'in-progress' }]]
      if (/FROM consultations/.test(sql)) return [saved ? [{ ...saved }] : []]
      if (/INSERT INTO consultations/.test(sql)) { if (fail) throw Object.assign(Error('synthetic database failure'), { code: 'ECONNRESET' }); saved = { id: 41, status: 'draft', version: 1 }; return [{ insertId: 41 }] }
      if (/UPDATE consultations/.test(sql)) { if (fail) throw Object.assign(Error('synthetic database failure'), { code: 'ECONNRESET' }); updates++; saved.version++; return [{ affectedRows: 1 }] }
      throw Error('Unexpected query in synthetic draft')
    },
  }
  const api = controller({ getConnection: async () => conn })
  const response = res()
  await api.saveConsultationDraft(req({ expected_version: 0 }), response)
  assert.equal(response.body.consultation_version, 1)
  assert.equal(commits, 1)
  await assert.rejects(api.saveConsultationDraft(req({ expected_version: 0 }), res()), error => error.code === 'CONSULTATION_VERSION_CONFLICT')
  assert.equal(updates, 0)
  assert.equal(commits, 1)
  fail = true
  await assert.rejects(api.saveConsultationDraft(req({ expected_version: 1 }), res()), error => error.code === 'ECONNRESET')
  assert.equal(commits, 1)
  assert.equal(saved.version, 1)
  assert.equal(rollbacks, 2)
  assert.equal(releases, 3)
})

test('version validation rejects invalid values while retaining legacy payload compatibility', () => {
  for (const value of [-1, 1.5, '1', null, {}, Infinity]) assert.throws(() => assertConsultationVersion({ expected_version: value }, { version: 1 }), error => error.code === 'VALIDATION_ERROR')
  assert.doesNotThrow(() => assertConsultationVersion({}, { version: 7 }))
  assert.doesNotThrow(() => assertConsultationVersion({ expected_version: 0 }, null))
  assert.doesNotThrow(() => assertConsultationVersion({ expected_version: 7 }, { version: 7 }))
})
