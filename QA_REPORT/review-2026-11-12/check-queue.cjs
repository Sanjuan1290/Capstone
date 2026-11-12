const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
const jwt = require('../../server/node_modules/jsonwebtoken')
const env = { NODE_ENV: 'production', JWT_SECRET: 'synthetic-jwt-secret-32-characters-long', DB_HOST: 'localhost', DB_USER: 'synthetic', DB_NAME: 'synthetic', DB_PASSWORD: 'synthetic', CLIENT_URL: 'https://example.invalid', API_PROXY_SECRET: 'x'.repeat(32), RESEND_API_KEY: 'synthetic', EMAIL_FROM: 'qa@example.invalid' }
let savedPin = null, audits = 0
const query = async (sql, values) => {
  if (sql.startsWith('INSERT INTO branch_queue_display_security')) {
    assert.equal(values[0], 1)
    savedPin = { pin_hash: values[1], pin_version: (savedPin?.pin_version || 0) + 1 }
    return [{ affectedRows: 1 }]
  }
  if (sql.includes('FROM branch_queue_display_security')) return [[savedPin].filter(Boolean)]
  if (sql.includes('FROM clinic_branches')) return [[{ id: 1, name: 'Synthetic branch' }]]
  throw Error(`Unexpected synthetic SQL ${sql}`)
}
const conn = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }
const db = { query, getConnection: async () => conn }
const load = (relative, dependencies) => {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), { module, Buffer, URL, process: { env }, require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name] } })
  return module.exports
}
const security = load('server/utils/queueDisplaySecurity.js', { crypto, '../db/connect': db, './audit': { writeAuditLog: async () => { audits++ } } })
const handlers = { get: {}, post: {} }, router = { get(path, ...chain) { handlers.get[path] = chain }, post(path, ...chain) { handlers.post[path] = chain } }
load('server/routers/queue.router.js', { crypto, express: { Router: () => router }, jsonwebtoken: jwt, '../db/connect': db, '../middlewares/rateLimit.middleware': { queueDisplayLimiter: () => {} }, '../utils/date': {}, '../utils/queueDisplaySecurity': security })
const response = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this }, cookie(name, token, options) { this.token = token; this.cookieOptions = options }, clearCookie() { this.cleared = true } })
async function main() {
  env.QUEUE_DISPLAY_PIN = '918273'
  const legacy = response()
  await handlers.post['/display/unlock'].at(-1)({ body: { branch_id: 1, pin: env.QUEUE_DISPLAY_PIN } }, legacy)
  assert.equal(legacy.statusCode, 200)
  assert.equal(jwt.verify(legacy.token, env.JWT_SECRET).pin_version, 0)
  const generated = response()
  await security.generateBranchPin({ branchId: 1, user: { id: 9 }, adminContext: { account_role: 'superadmin' } }, generated)
  assert.match(generated.body.pin, /^\d{8}$/)
  assert.equal(security.comparePin(generated.body.pin, savedPin.pin_hash), true)
  assert.equal(security.comparePin('00000000', savedPin.pin_hash), false)
  assert.notEqual(savedPin.pin_hash, generated.body.pin)
  const legacyRevoked = response()
  await handlers.get['/live'][0]({ cookies: { queue_display_token: legacy.token } }, legacyRevoked, () => { throw Error('Legacy token accepted after branch PIN configured') })
  assert.equal(legacyRevoked.statusCode, 401)
  const unlocked = response()
  await handlers.post['/display/unlock'].at(-1)({ body: { branch_id: 1, pin: generated.body.pin } }, unlocked)
  assert.equal(unlocked.statusCode, 200)
  assert.equal(unlocked.cookieOptions.httpOnly, true)
  assert.equal(jwt.verify(unlocked.token, env.JWT_SECRET).branch_id, 1)
  let authorized = false
  await handlers.get['/live'][0]({ cookies: { queue_display_token: unlocked.token } }, response(), () => { authorized = true })
  assert.equal(authorized, true)
  await security.generateBranchPin({ branchId: 1, user: { id: 9 } }, response())
  const expired = response()
  await handlers.get['/live'][0]({ cookies: { queue_display_token: unlocked.token } }, expired, () => { throw Error('Rotated token accepted') })
  assert.equal(expired.statusCode, 401)
  let missingEnvPin
  delete env.QUEUE_DISPLAY_PIN
  const validation = load('server/utils/envValidation.js', {})
  try { validation.validateRuntimeConfig() } catch (error) { missingEnvPin = Array.from(error.details).find(message => message.includes('QUEUE_DISPLAY_PIN')) }
  assert.ok(missingEnvPin)
  const result = { syntheticOnly: true, productionWrites: 0, generatedPinDigits: 8, pinStoredHashed: true, wrongPinRejected: true, branchBoundHttpOnlyCookie: true, legacyPinFallbackWorks: true, legacySessionRevokedAfterSetup: true, oldSessionRejectedAfterRotation: true, auditEvents: audits, productionStartupWithoutLegacyPin: missingEnvPin }
  fs.writeFileSync(path.join(__dirname, 'queue-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
