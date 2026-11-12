const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const bcrypt = require('bcrypt')
const cryptoTools = require('../../utils/securityCrypto'), phoneTools = require('../../utils/phone')
const profileTools = require('../../utils/patientProfile')
const root = path.resolve(__dirname, '../..')
const load = (file, dependencies) => {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module, Buffer, Date, console, process: { env: { NODE_ENV: 'test' } }, require: name => dependencies[name] || {} }, { filename: file })
  return module.exports
}
const identity = require('../../utils/patientRegistrationIdentity')
function harness(patients = []) {
  let state = { patients: structuredClone(patients), pending: [], consents: [], audits: [], appointments: [{ id: 99, patient_id: 42 }], bills: [{ id: 100, patient_id: 42, total: 650 }], nextPatient: 1000 }
  const calls = [], messages = [], sessions = [], settings = { failConsent: false, failAudit: false, failDuplicate: false }
  let transaction = Promise.resolve()
  const query = async (conn, sql, values = []) => {
    calls.push({ sql, values })
    const data = conn?.draft || state
    if (sql.includes('FROM patients') && sql.includes('ORDER BY id')) {
      const [phone, , , email] = values
      return [data.patients.filter(row => phoneTools.normalizePhilippinePhone(row.phone) === phone || String(row.email || '').trim().toLowerCase() === email).map(row => ({ ...row, gender: row.gender || row.sex }))]
    }
    if (sql.includes('INSERT INTO patient_phone_verifications')) {
      const row = { id: 1, phone: values[0], otp_code: values[1], payload: values[2], expires_at: values[3], attempt_count: 0 }
      data.pending = data.pending.filter(entry => entry.phone !== row.phone); data.pending.push(row); return [{ affectedRows: 1 }]
    }
    if (sql.includes('SELECT * FROM patient_phone_verifications')) return [data.pending.filter(row => row.phone === values[0] && (!sql.includes('expires_at > NOW()') || new Date(row.expires_at).getTime() > Date.now()))]
    if (sql.startsWith('UPDATE patient_phone_verifications SET attempt_count')) { data.pending.find(row => row.id === values[1]).attempt_count = values[0]; return [{ affectedRows: 1 }] }
    if (sql.startsWith('DELETE FROM patient_phone_verifications')) { data.pending = data.pending.filter(row => row.id !== values[0]); return [{ affectedRows: 1 }] }
    if (sql.startsWith('UPDATE patients')) {
      const row = data.patients.find(row => row.id === values[10] && Number(row.is_walk_in) === 1 && !row.password && !Number(row.is_banned))
      if (!row) return [{ affectedRows: 0 }]
      if (settings.failDuplicate || data.patients.some(other => other.id !== row.id && other.email === values[2])) throw Object.assign(Error('Synthetic duplicate email'), { code: 'ER_DUP_ENTRY' })
      row.email_verified_at = String(row.email).trim().toLowerCase() === values[0].toLowerCase() ? row.email_verified_at : null
      Object.assign(row, { full_name: values[1], email: values[2], phone: values[3], birthdate: values[4], gender: values[5], sex: values[6], address: values[7], password: values[8], receive_promotions: values[9], is_walk_in: 0, consent_given: 1, is_profile_complete: 1, consent_method: 'online_registration', phone_verified_at: new Date(), session_version: Number(row.session_version || 1) + 1 })
      return [{ affectedRows: 1 }]
    }
    if (sql.includes('INSERT INTO patients')) {
      if (settings.failDuplicate) throw Object.assign(Error('Synthetic duplicate email'), { code: 'ER_DUP_ENTRY' })
      const id = data.nextPatient++
      data.patients.push({ id, full_name: values[0], birthdate: values[1], gender: values[2], sex: values[3], phone: values[4], address: values[5], email: values[6], password: values[7], receive_promotions: values[8], is_walk_in: 0, consent_given: 1, is_profile_complete: 1, consent_method: 'online_registration', phone_verified_at: new Date(), email_verified_at: null, session_version: 1 })
      return [{ insertId: id }]
    }
    if (sql.startsWith('INSERT INTO patient_consents')) { if (settings.failConsent) throw Error('Synthetic consent failure'); data.consents.push({ patient_id: values[0], type: values[1] }); return [{ insertId: data.consents.length }] }
    if (sql.includes('FROM patients') && sql.includes('WHERE id = ?')) return [data.patients.filter(row => row.id === values[0])]
    throw Error('Unexpected synthetic registration query: ' + sql)
  }
  const db = { query: (sql, values) => query(null, sql, values), getConnection: async () => {
    let releaseTransaction
    const conn = { draft: null, beginTransaction: async () => {
      const previous = transaction
      transaction = new Promise(resolve => { releaseTransaction = resolve })
      await previous; conn.draft = structuredClone(state)
    }, commit: async () => { state = conn.draft; conn.draft = null; releaseTransaction() }, rollback: async () => { conn.draft = null; releaseTransaction?.() }, release() {} }
    conn.query = (sql, values) => query(conn, sql, values)
    return conn
  } }
  const security = load('utils/accountSecurity.js', { '../db/connect': db, './securityCrypto': cryptoTools })
  const controller = load('controllers/patient.controller.js', { '../db/connect': db, bcrypt,
    '../utils/patientProfile': profileTools, '../utils/phone': phoneTools, '../utils/securityCrypto': cryptoTools,
    '../utils/patientRegistrationIdentity': identity, '../utils/accountSecurity': security,
    '../utils/inputValidation': require('../../utils/inputValidation'), '../utils/registrationSmsLimits': { claimRegistrationSms: async () => {} },
    '../utils/smsService': { sendPatientRegistrationOtp: async message => { messages.push(message) } },
    '../utils/sessionSecurity': { issueSession: async (res, role, id) => { sessions.push({ role, id }); res.cookie('patient_token', 'synthetic-session') } },
    '../utils/audit': { writeAuditLog: async (entry, conn) => { if (settings.failAudit) throw Error('Synthetic audit failure'); conn.draft.audits.push(entry) } },
  })
  const body = (values = {}) => ({ full_name: 'Synthetic Walk In', email: 'walkin@example.test', phone: '09170000001', birthdate: '2005-01-18', gender: 'Male', address: 'Synthetic address', password: 'Synthetic123!', confirmPassword: 'Synthetic123!', consent_given: true, receive_promotions: true, ...values })
  const response = () => ({ statusCode: 200, cookies: {}, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this }, cookie(name, value) { this.cookies[name] = value } })
  const call = async (method, payload) => {
    const res = response()
    try { await controller[method]({ body: payload, ip: '127.0.0.1' }, res) }
    catch (error) { if (!error.statusCode) throw error; res.status(error.statusCode).json({ code: error.code, message: error.message }) }
    return res
  }
  return { call, body, calls, messages, sessions, settings, get state() { return state } }
}
const walkIn = (values = {}) => ({ id: 42, full_name: 'Synthetic Walk In', email: 'walkin@example.test', phone: '09170000001', birthdate: '2005-01-18', gender: 'Male', sex: 'Male', civil_status: 'Single', is_walk_in: 1, password: null, consent_method: 'walk_in', email_verified_at: null, session_version: 7, is_banned: 0, ...values })
module.exports = { harness, walkIn }
