'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const out = path.join(root, 'docs/audit-2026-10-28/evidence')
fs.mkdirSync(out, { recursive: true })
const env = { ...process.env }
// Remove inherited configuration too. Only key names are inspected; values are
// neither read into reports nor passed to subprocesses.
for (const file of ['server/.env', 'client/.env']) {
  if (!fs.existsSync(path.join(root, file))) continue
  for (const match of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/gm)) delete env[match[1]]
}
Object.assign(env, {
  NODE_ENV: 'test', DB_PROVIDER: 'mysql', DB_HOST: '127.0.0.1', DB_PORT: '9',
  DB_USER: 'synthetic_audit', DB_PASSWORD: '', DB_NAME: 'carait_disposable_audit',
  JWT_SECRET: 'synthetic-audit-secret-no-production-access-20261028',
  CLIENT_URL: 'http://localhost:5173', PAYMONGO_MODE: '',
  PAYMONGO_LIVE_ENABLED: 'false', RUN_SCHEMA_MIGRATIONS_ON_STARTUP: 'false',
  NODE_OPTIONS: `--require="${path.join(__dirname, 'networkGuard.cjs').replace(/\\/g, '/')}"`,
})
const checks = {
  'server-source': ['server', ['npm', 'run', 'verify:source']],
  'browser-smoke': ['.', ['node', 'scripts/audit/browserSmoke.cjs']],
  'server-coverage': ['server', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--coverage', '--coverage.include=controllers/**', '--coverage.include=routers/**', '--coverage.include=utils/**', '--coverage.include=middlewares/**', '--coverage.include=db/*.js', '--coverage.include=server.js', '--coverage.reporter=json-summary', '--coverage.reporter=text-summary', '--coverage.reportsDirectory=../docs/audit-2026-10-28/evidence/coverage']],
  'server-vitest': ['server', ['npm', 'test']],
  'server-node': ['server', ['npm', 'run', 'test:node']],
  'client-node': ['client', ['node', '--test', ...fs.readdirSync(path.join(root, 'client/tests')).filter(n => n.endsWith('.mjs')).map(n => `tests/${n}`)]],
  'client-build': ['client', ['npm', 'run', 'build']],
  'client-lint': ['client', ['npm', 'run', 'lint']],
  'deployment-node': ['.', ['node', '--test', 'tests/deployment/sourceExport.node.cjs']],
  'branch-routes': ['server', ['node', 'scripts/verifyBranchRouteCoverage.js']],
  'reports-sql': ['server', ['npm', 'run', 'verify:reports-sql']],
  'focused-node': ['server', ['node', '--test', 'tests/consultations/clinicalSafety.node.cjs', 'tests/security/sessionLifecycle.node.cjs', 'tests/deployment/migrationRunner.node.cjs', 'tests/gateway/paymongoWebhook.node.cjs', 'tests/gateway/batch3CancellationSafety.node.cjs', 'tests/gateway/paymongoRefundProof20261017.node.cjs', 'tests/branchIntegration/walkInBranchSafety.node.cjs', 'tests/inventory/clinicExpiry.node.cjs']],
  'focused-client': ['client', ['node', '--test', 'tests/consultationAutosave.node.test.mjs', 'tests/batch12PortalBooking.node.test.mjs', 'tests/batch3QrCancellationUi.node.test.mjs', 'tests/passwordPolicy.node.test.mjs', 'tests/sessionLogout.node.test.mjs']],
  'inventory-regression': ['server', ['node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/security/inventoryConcurrency.test.js', 'tests/inventory/manualStockOut.test.js', 'tests/supplyRequests/multiItemStockTransfers.test.js']],
  'server-dependencies': ['server', ['npm', 'audit', '--json', '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=15000']],
  'client-dependencies': ['client', ['npm', 'audit', '--json', '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=15000']],
}
const repeatArg=process.argv.find(arg=>/^--repeat=\d+$/.test(arg))
const repeat=repeatArg?Number(repeatArg.split('=')[1]):1
if(repeat<1||repeat>10)throw Error('Audit repeat count must be 1-10')
const selected = process.argv.slice(2).filter(arg=>arg!==repeatArg)
for(let run=1;run<=repeat;run++) for (const name of selected.length ? selected : Object.keys(checks)) {
  if (!checks[name]) throw Error(`Unknown audit check ${name}`)
  const [cwd, command] = checks[name]
  const started = Date.now()
  // Invoke npm's JavaScript entrypoint directly, avoiding shell quoting and
  // execution-policy differences on Windows.
  const args = command[0] === 'npm'
    ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...command.slice(1)]
    : command.slice(1)
  const checkEnv={...env}
  if(name.endsWith('-dependencies')){
    // npm audit reads the npm registry only; it must be allowed through the test
    // guard. Lifecycle scripts remain disabled and clinic credentials are absent.
    delete checkEnv.NODE_OPTIONS
    checkEnv.npm_config_cache=path.join(require('node:os').tmpdir(),'carait-audit-npm-cache')
  }
  const result = spawnSync(process.execPath, args, { cwd: path.join(root, cwd), env:checkEnv, encoding: 'utf8', timeout: 240000, maxBuffer: 32 * 1024 * 1024 })
  const log = (result.stdout || '') + (result.stderr || '')
  const artifact=repeat>1?`${name}-run-${run}`:name
  fs.writeFileSync(path.join(out, `${artifact}.log`), log)
  const summary = { command: command.join(' '), cwd, exitCode: result.status, signal: result.signal, error: result.error?.code, durationMs: Date.now() - started }
  if(result.status!==0)process.exitCode=1
  fs.writeFileSync(path.join(out, `${artifact}.json`), JSON.stringify(summary, null, 2) + '\n')
  if(name==='browser-smoke'&&repeat>1&&fs.existsSync(path.join(out,'browser-smoke.json')))fs.copyFileSync(path.join(out,'browser-smoke.json'),path.join(out,`${artifact}.browser.json`))
  console.log(artifact, JSON.stringify(summary))
  if(name.endsWith('-dependencies'))try{console.log(JSON.stringify(JSON.parse(result.stdout).metadata?.vulnerabilities))}catch{}
  // Print counts and failures only. Full synthetic-data logs remain local.
  console.log(log.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(line => /(?:Test Files |Tests |# (?:tests|pass|fail|cancelled|skipped|todo)|^[✖×]|^ FAIL |error |warning |passed:|failed:|Error:|verification|built in|problems \()/.test(line)).slice(-35).join('\n'))
}
