'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  PAGE_SIZE_OPTIONS,
  parseDirectoryPagination,
  buildPatientDirectoryWhere,
  parseBanState,
} = require('../utils/superadminPatientDirectory')

const root = path.resolve(__dirname, '..', '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('pagination defaults to page 1 and 20 rows', () => {
  assert.deepEqual(parseDirectoryPagination(undefined, undefined), { page: 1, pageSize: 20, offset: 0 })
})

test('pagination accepts only supported page sizes', () => {
  assert.deepEqual(PAGE_SIZE_OPTIONS, [10, 20, 50])
  assert.equal(parseDirectoryPagination('3', '50').offset, 100)
  assert.equal(parseDirectoryPagination('3', '25').pageSize, 20)
})

test('invalid and unsafe page values fall back safely', () => {
  assert.equal(parseDirectoryPagination('-1', '10').page, 1)
  assert.equal(parseDirectoryPagination('1e100', '10').page, 1)
  assert.equal(parseDirectoryPagination('2.5', '10').page, 1)
})

test('directory always excludes walk-in-only records', () => {
  const result = buildPatientDirectoryWhere()
  assert.match(result.whereSql, /COALESCE\(p\.is_walk_in, 0\) = 0/)
  assert.deepEqual(result.params, [])
})

test('search filters by name, email and phone using bound parameters', () => {
  const result = buildPatientDirectoryWhere({ search: '0917 123 4567' })
  assert.match(result.whereSql, /p\.full_name/)
  assert.match(result.whereSql, /p\.email/)
  assert.match(result.whereSql, /p\.phone LIKE/)
  assert.match(result.whereSql, /REPLACE\(REPLACE\(REPLACE/)
  assert.equal(result.params.length, 4)
  assert.equal(result.params[3], '%639171234567%')
})

test('digits inside names and email addresses do not broaden searches to unrelated phone numbers', () => {
  for (const search of ['patient1@example.com', 'Patient 1']) {
    const result = buildPatientDirectoryWhere({ search })
    assert.equal(result.params.length, 3)
    assert.doesNotMatch(result.whereSql, /REPLACE\(REPLACE\(REPLACE/)
  }
})

test('status filters distinguish active and banned accounts', () => {
  assert.match(buildPatientDirectoryWhere({ status: 'active' }).whereSql, /is_banned, 0\) = 0/)
  assert.match(buildPatientDirectoryWhere({ status: 'banned' }).whereSql, /is_banned, 0\) = 1/)
  assert.doesNotMatch(buildPatientDirectoryWhere({ status: 'all' }).whereSql, /is_banned/)
})

test('ban request accepts only a boolean', () => {
  assert.equal(parseBanState(true), true)
  assert.equal(parseBanState(false), false)
  assert.throws(() => parseBanState('true'), { code: 'INVALID_BAN_STATUS', statusCode: 400 })
  assert.throws(() => parseBanState(1), { code: 'INVALID_BAN_STATUS', statusCode: 400 })
})

test('patient directory API is protected by the Super Admin cookie', () => {
  const router = read('server/routers/superadminPatients.router.js')
  assert.match(router, /router\.use\(authenticate\('superadmin_token'\)\)/)
  assert.match(router, /router\.get\('\//)
  assert.match(router, /router\.get\('\/:patientId'/)
  assert.match(router, /router\.patch\('\/:patientId\/ban'/)
})

test('banning revokes active sessions and login returns a clear restriction message', () => {
  const router = read('server/routers/superadminPatients.router.js')
  const sessions = read('server/utils/sessionSecurity.js')
  const patientController = read('server/controllers/patient.controller.js')
  assert.match(router, /session_version = COALESCE\(session_version, 1\) \+ 1/)
  assert.match(sessions, /COALESCE\(is_banned, 0\) AS is_banned/)
  assert.match(sessions, /PATIENT_ACCOUNT_BANNED/)
  assert.match(patientController, /PATIENT_ACCOUNT_BANNED/)
  assert.match(patientController, /Your Carait Clinic account has been banned/)
  const middleware = read('server/middlewares/auth.middleware.js')
  const authContext = read('client/src/context/AuthContext.jsx')
  const patientLogin = read('client/src/pages/auth/Patient/PatientLogin.jsx')
  assert.match(middleware, /PATIENT_ACCOUNT_BANNED/)
  assert.match(authContext, /authNotice/)
  assert.match(patientLogin, /error \|\| authNotice/)
})

test('Super Admin navigation and route expose the patient directory', () => {
  const app = read('client/src/App.jsx')
  const portal = read('client/src/pages/superAdminPage/BranchPortals.jsx')
  const page = read('client/src/pages/superAdminPage/redesign/Patients.jsx')
  assert.match(app, /path='patients' element=\{<SuperAdminPatients \/>\}/)
  assert.match(portal, /to:'\/superadmin\/patients'/)
  assert.match(page, /Search name, email or contact number/)
  assert.match(page, /history_page_size/)
  assert.match(page, /role="switch"/)
})


test('patient ban schema is included in the migration runner and startup schema checks', () => {
  const migrationRunner = read('server/scripts/branchMigrations.js')
  const schema = read('server/utils/schema.js')
  const migration = read('server/db/migrations/2026-11-09-superadmin-patient-directory-ban.sql')
  assert.match(migrationRunner, /2026-11-09-superadmin-patient-directory-ban\.sql/)
  assert.match(schema, /ensureColumn\('patients', 'is_banned'/)
  assert.match(schema, /ensureColumn\('patients', 'banned_at'/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_banned/)
})
