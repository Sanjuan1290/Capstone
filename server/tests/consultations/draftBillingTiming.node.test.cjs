const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function harness() {
  const state = { consultation: null, bills: [], committed: 0, queries: [] }
  const appointment = { id: 9, doctor_id: 3, patient_id: 4, branch_id: 1, status: 'in-progress', requested_service_id: 77 }
  const query = async (sql, args = []) => {
    state.queries.push(sql)
    if (sql.startsWith('SELECT * FROM appointments')) return [[{ ...appointment }]]
    if (sql.includes('FROM queue')) return [[]]
    if (sql.includes('FROM consultations c')) return [[{ ...state.consultation }]]
    if (sql.startsWith('SELECT id, status, version')) return [state.consultation ? [{ ...state.consultation }] : []]
    if (sql.startsWith('INSERT INTO consultations')) { state.consultation = { id: 11, status: 'draft', version: 1 }; return [{ insertId: 11 }] }
    if (sql.startsWith('UPDATE consultations SET billable_services_json')) state.consultation.billable_services_json = args[0]
    else if (sql.startsWith('UPDATE consultations') && sql.includes("SET status='finalized'")) { state.consultation.status = 'finalized'; state.consultation.billable_services_json = args[1] }
    else if (sql.startsWith('UPDATE consultations')) state.consultation.version++
    else if (sql.startsWith('UPDATE appointments')) appointment.status = 'completed'
    else if (sql.startsWith('SELECT status FROM billing_records')) return [[]]
    else throw new Error('Unexpected SQL: ' + sql)
    return [{ affectedRows: 1 }]
  }
  const conn = { query, async beginTransaction() {}, async commit() { state.committed++ }, async rollback() {}, release() {} }
  const imports = {
    '../db/connect': { query, async getConnection() { return conn } },
    '../utils/inputValidation': require('../../utils/inputValidation'),
    '../utils/consultationIntegrity': { assertConsultationVersion() {}, assertConsultationEditable() {}, async loadConsultationAmendments() { return {} } },
    '../utils/consultationFollowups': { async saveFollowup() {}, async readFollowup() { return null } },
    '../utils/consultationImages': { async loadImagesForConsultationIds() { return {} } },
    '../utils/billing': {
      async getBillingCatalogServiceById() { return { id: 77, is_active: 1, service_name: 'Consultation', materials: [] } },
      async getBillingByAppointmentId() { return state.bills[0] || null },
      async upsertDraftBillingForAppointment({ items }) {
        assert.equal(state.consultation.status, 'finalized', 'Clinical completion must precede billing')
        assert.equal(appointment.status, 'completed')
        const bill = { id: 30, status: 'draft', saved_services: items }
        state.bills.push(bill)
        return bill
      },
    },
    '../utils/appointmentSecurity': { assertAppointmentTransition() {} },
    '../utils/audit': { async writeAuditLog() {} },
    '../utils/sse': { broadcast() {} },
    '../utils/date': { getTodayDateOnly: () => '2026-11-17' },
    '../utils/notifications': { async createNotification() {} },
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../controllers/doctor.controller.js'), 'utf8'), {
    module, require: name => imports[name] || {}, console,
  })
  const req = { params: { appointmentId: '9' }, user: { id: 3 }, branchId: 1, body: { diagnosis: 'Review', prescription_status: 'none', billable_services: [{ catalog_service_id: 77, quantity: 1, materials: [] }] } }
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this }, json(value) { this.body = value; return this } })
  return { controller: module.exports, state, req, response }
}

test('draft autosaves persist selected services without generating or updating billing', async () => {
  const h = harness()
  for (let i = 0; i < 2; i++) {
    const res = h.response()
    await h.controller.saveConsultationDraft(h.req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.billing, null)
    assert.equal(h.state.bills.length, 0)
    assert.equal(JSON.parse(h.state.consultation.billable_services_json)[0].catalog_service_id, 77)
  }
  assert.ok(h.state.queries.every(sql => !/billing_records|billing_items/.test(sql)))
  const loaded = h.response()
  await h.controller.getConsultation(h.req, loaded)
  assert.equal(loaded.body.billable_services[0].catalog_service_id, 77)
  assert.equal(loaded.body.billing, null)
})

test('completing a saved consultation creates its pending bill from saved draft services', async () => {
  const h = harness()
  await h.controller.saveConsultationDraft(h.req, h.response())
  delete h.req.body.billable_services
  const completed = h.response()
  await h.controller.finalizeConsultation(h.req, completed)
  assert.equal(completed.statusCode, 200)
  assert.equal(completed.body.status, 'finalized')
  assert.equal(h.state.bills.length, 1)
  assert.equal(completed.body.billing.status, 'draft')
  assert.equal(completed.body.billing.saved_services[0].catalog_service_id, 77)
})
