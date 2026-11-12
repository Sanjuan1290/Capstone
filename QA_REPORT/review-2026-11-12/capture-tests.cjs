const fs = require('node:fs'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const run = (name, cwd, args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { cwd: path.join(root, cwd), env, windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  fs.writeFileSync(path.join(__dirname, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}`)
  if (result.error) throw result.error
  return { exitCode: result.status, output: result.stdout || '' }
}
const tap = result => ({ exitCode: result.exitCode, tests: Number(result.output.match(/^# tests (\d+)/m)?.[1]), passed: Number(result.output.match(/^# pass (\d+)/m)?.[1]), failed: Number(result.output.match(/^# fail (\d+)/m)?.[1]), failures: [...result.output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]) })
const existingFiles = ['tests/security/queueDisplayBranch20261015.node.cjs', 'tests/security/receiptLocationRegression20261015.node.cjs', 'tests/inventory/compactBarcodes.node.test.cjs', 'tests/branchIntegration/branchInventoryBatches20261028.node.cjs', 'tests/inventory/bulkExcelWorkflow.node.test.cjs', 'tests/inventory/excelOpeningAndCategory.node.test.cjs']
const baselineEnv = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(path.join(__dirname, 'preload-head.cjs').replaceAll('\\', '/'))}` }
const current = tap(run('backend-existing', 'server', ['--test', ...existingFiles]))
const baseline = tap(run('backend-existing-head', 'server', ['--test', ...existingFiles], baselineEnv))
const focused = tap(run('backend-focused', 'server', ['--test', 'tests/inventory/fix11BatchAndDoctorIdentity.node.test.cjs', 'tests/inventory/fix7Inventory20261112.node.test.cjs', 'tests/inventory/compactBarcodes.node.test.cjs']))
const frontendFiles = fs.readdirSync(path.join(root, 'client/tests')).filter(name => /inventory|billingReceipt/i.test(name) && name.endsWith('.mjs')).map(name => `tests/${name}`)
const frontend = tap(run('frontend-inventory-receipts', 'client', ['--test', ...frontendFiles]))
function vitest(name, env) {
  const filename = path.join(__dirname, `${name}.json`)
  const runResult = run(name, 'server', ['node_modules/vitest/vitest.mjs', 'run', 'tests/security/queueDisplayAuth.test.js', 'tests/security/batch6CDoctorAccounts.test.js', '--reporter=json', `--outputFile=${filename}`], env)
  const result = JSON.parse(fs.readFileSync(filename, 'utf8'))
  return { exitCode: runResult.exitCode, tests: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests, failures: result.testResults.flatMap(suite => suite.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName)) }
}
const currentVitest = vitest('vitest-current', process.env), baselineVitest = vitest('vitest-head', baselineEnv)
const summary = { focused, frontend, current, baseline, introducedNodeFailures: current.failures.filter(name => !baseline.failures.includes(name)), existingNodeFailures: current.failures.filter(name => baseline.failures.includes(name)), currentVitest, baselineVitest,
  introducedVitestFailures: currentVitest.failures.filter(name => !baselineVitest.failures.includes(name)), productionWrites: 0 }
fs.writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
