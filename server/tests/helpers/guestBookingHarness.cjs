const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
const { getClinicDateTimeSql } = require('../../utils/date')
const phoneTools = require('../../utils/phone')
const securityCrypto = require('../../utils/securityCrypto')
const jwt = require('jsonwebtoken')

function harness(seed = {}) {
  let state = { patients: [], appointments: [], access: [], codes: [], nextPatient: 1, nextAppointment: 1, nextCode: 1, ...structuredClone(seed) }
  const env = { JWT_SECRET: 'synthetic-guest-test-secret-at-least-32-chars', NODE_ENV: 'test' }
  const calls = [], messages = [], notifications = [], validations = [], locks = new Map()
  const settings = { smsAvailable: true, failDelivery: false, rejectSlot: false }
  const now = () => getClinicDateTimeSql(new Date(), 'Asia/Manila')
  const load = (relative, dependencies) => {
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), { module, Buffer, Date, URL, console, process: { env }, require(name) { assert.ok(Object.hasOwn(dependencies, name), 'Unexpected dependency ' + name); return dependencies[name] } }, { filename: relative })
    return module.exports
  }
  const acquire = async (name, owner) => {
    const held = locks.get(name)
    if (!held) { locks.set(name, { owner, waiting: [] }); return }
    if (held.owner === owner) return
    await new Promise(resolve => held.waiting.push({ owner, resolve }))
  }
  const release = (name, owner) => {
    const held = locks.get(name)
    if (!held || held.owner !== owner) return
    const next = held.waiting.shift()
    if (next) { held.owner = next.owner; next.resolve() } else locks.delete(name)
  }
  const query = async (conn, sql, values = []) => {
    calls.push({ sql, values: [...values] })
    if (sql.startsWith('SELECT GET_LOCK')) { await acquire(values[0], conn); return [[{ acquired: 1 }]] }
    if (sql.startsWith('SELECT RELEASE_LOCK')) { release(values[0], conn); return [[{ released: 1 }]] }
    const draft = conn.draft || state
    if (sql.startsWith('SELECT COUNT(*) AS used')) {
      const [a, b, c, from, to] = values
      return [[{ used: draft.appointments.filter(appt => appt.source === 'guest_online' && appt.created_at >= from && appt.created_at < to && draft.patients.some(patient => patient.id === appt.patient_id && [a,b,c].includes(String(patient.phone).replace(/\D/g,'')))).length }]]
    }
    if (sql.startsWith('SELECT p.id')) return [draft.patients.filter(patient => values.includes(String(patient.phone).replace(/\D/g,''))).slice(0,2).map(patient => ({ ...patient, has_password: patient.password ? 1 : 0 }))]
    if (sql.startsWith('SELECT id FROM patients WHERE LOWER')) return [[draft.patients.find(patient => String(patient.email || '').toLowerCase() === String(values[0]).toLowerCase() && patient.id !== values[1])].filter(Boolean)]
    if (sql.includes('FROM guest_booking_access g')) {
      const access = draft.access.find(row => row.token_hash === values[0])
      return [[access && draft.appointments.find(appt => appt.id === access.appointment_id)].filter(Boolean)]
    }
    if (sql.startsWith('INSERT INTO patients')) {
      const id = draft.nextPatient++
      draft.patients.push({ id, full_name: values[0], birthdate: values[1], reported_age: values[2], gender: values[3], phone: values[5], address: values[6], email: values[7], password: null, consent_method: 'guest_online' })
      return [{ insertId: id }]
    }
    if (sql.startsWith('INSERT INTO patient_consents')) return [{ insertId: 1 }]
    if (sql.startsWith('INSERT INTO appointments')) {
      const id = draft.nextAppointment++
      draft.appointments.push({ id, patient_id: values[0], doctor_id: values[1], clinic_type: values[2], requested_service_id: values[3], price: values[5], patient_age_at_visit: values[8], reason: values[10], appointment_date: values[11], appointment_time: values[12], notes: values[13], branch_id: values[14], status: 'pending', source: 'guest_online', created_at: now() })
      return [{ insertId: id }]
    }
    if (sql.startsWith('INSERT INTO guest_booking_access')) { draft.access.push({ appointment_id: values[0], token_hash: values[1] }); return [{ insertId: draft.access.length }] }
    if (sql.includes('FROM clinic_branches')) return [[{ id: values[0], name: 'Synthetic Branch', offers_medical: 1, offers_derma: 1 }]]
    if (sql.includes('FROM doctors d')) return [[{ id: values[1], full_name: 'Synthetic Doctor', clinic_type: 'medical' }]]
    if (sql.includes('FROM billing_service_catalog')) return [[{ id: values[0], clinic_type: 'medical', service_name: 'Synthetic Service', default_price: 650, average_duration_minutes: 60 }]]
    if (sql.includes('FROM appointment_reason_options')) return [[{ id: 1 }]]
    if (sql.startsWith('SELECT') && sql.includes('FROM account_security_codes')) {
      const row = draft.codes.find(row => row.role === values[0] && row.account_id === values[1] && row.purpose === values[2])
      if (sql.startsWith('SELECT TIMESTAMPDIFF')) return [row ? [{ elapsed_seconds: (Date.now() - row.last_sent_at.getTime()) / 1000 }] : []]
      return [row && row.expires_at.getTime() > Date.now() ? [row] : []]
    }
    if (sql.startsWith('DELETE FROM account_security_codes')) {
      if (sql.includes('WHERE id = ?')) draft.codes = draft.codes.filter(row => row.id !== values[0])
      else if (sql.includes('account_id=0')) draft.codes = draft.codes.filter(row => !(row.role === values[0] && row.account_id === 0 && row.purpose === values[1] && row.code === values[2]))
      else draft.codes = draft.codes.filter(row => !(row.role === values[0] && row.account_id === values[1] && row.purpose === values[2]))
      return [{ affectedRows: 1 }]
    }
    if (sql.startsWith('INSERT INTO account_security_codes')) {
      const id = draft.nextCode++
      draft.codes.push({ id, role: values[0], account_id: values[1], purpose: values[2], code: values[3], payload: values[4], expires_at: values[5], attempt_count: 0, last_sent_at: new Date() })
      return [{ insertId: id }]
    }
    if (sql.startsWith('UPDATE account_security_codes SET attempt_count')) { const row = draft.codes.find(row => row.id === values[0]); if (row) row.attempt_count++; return [{ affectedRows: 1 }] }
    throw Error('Unexpected synthetic query: ' + sql)
  }
  const connection = () => {
    const conn = { draft: null, beginTransaction: async () => { conn.draft = structuredClone(state) }, commit: async () => { state = conn.draft; conn.draft = null }, rollback: async () => { conn.draft = null }, release() {} }
    conn.query = (sql, values) => query(conn, sql, values)
    return conn
  }
  const unscoped = connection(), db = { query: (sql, values) => query(unscoped, sql, values), getConnection: async () => connection() }
  const policy = load('utils/guestBookingPolicy.js', { 'node:crypto': require('node:crypto'), jsonwebtoken: jwt, './date': require('../../utils/date') })
  const security = load('utils/accountSecurity.js', { '../db/connect': db, bcrypt: {}, './emailService': {}, './smsService': {}, './phone': phoneTools, './securityCrypto': securityCrypto, './sessionSecurity': {} })
  const phoneController = load('controllers/guestPhoneVerification.controller.js', { 'node:crypto': require('node:crypto'), '../db/connect': db, '../utils/phone': phoneTools, '../utils/accountSecurity': security, '../utils/securityCrypto': securityCrypto, '../utils/registrationSmsLimits': { claimRegistrationSms: async () => {} }, '../utils/smsService': { isSmsConfigured: () => settings.smsAvailable, sendGuestBookingOtp: async payload => { if (settings.failDelivery) throw Error('Synthetic provider failure'); messages.push(payload) } }, '../utils/guestBookingPolicy': policy })
  const booking = load('controllers/guestBooking.controller.js', { crypto: require('node:crypto'), '../db/connect': db, '../utils/phone': phoneTools, '../utils/patientProfile': { validateBirthdate: () => null },
    '../utils/appointmentSecurity': { withAppointmentSlotLock: async (_, callback) => callback(), validateAppointmentSlot: async args => { validations.push(args); if (settings.rejectSlot) throw Object.assign(Error('Slot unavailable'), { statusCode: 409, code: 'APPOINTMENT_TIME_CONFLICT' }) } },
    '../utils/bookingPolicy': { loadBookingSettings: async () => ({ booking_start_interval_minutes: 30, online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60 }), roundReservedDurationMinutes: () => 60, buildConfirmationDeadlineSql: () => '2027-02-01 09:00:00' },
    '../utils/date': require('../../utils/date'), '../utils/notifications': { notifyRoles: async (...args) => notifications.push(args) }, '../utils/sse': { broadcast() {} }, '../utils/audit': { writeAuditLog: async () => {} },
    '../utils/bookingReadiness': { getOnlineBookingReadiness: async () => ({}), applyBranchBookingOfferings: () => ({ medical: { bookable: true } }) }, '../utils/guestBookingPolicy': policy })
  const cookies = {}
  const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this }, setHeader() {}, cookie(name, token, options) { cookies[name] = token; this.cookieOptions = options }, json(value) { this.body = value; return this } })
  const body = (overrides = {}) => ({ full_name: 'Synthetic Guest', gender: 'Female', reported_age: 35, phone: '09170000001', consent_given: true, branch_id: 1, doctor_id: 8, requested_service_id: 77, clinic_type: 'medical', appointment_date: '2027-02-01', appointment_time: '10:00 AM', reason: 'Other', reason_details: 'Synthetic follow up', ...overrides })
  const request = (payload = {}) => ({ body: payload, cookies: { ...cookies }, ip: '127.0.0.1' })
  const verified = async phone => { const res = response(); await phoneController.requestCode(request({ phone }), res); const result = response(); await phoneController.verifyCode(request({ phone, code: messages.at(-1).code }), result); return result }
  return { db, policy, booking, phoneController, security, settings, calls, messages, notifications, validations, cookies, response, request, body, verified, get state() { return state }, locks }
}
module.exports = { harness }
