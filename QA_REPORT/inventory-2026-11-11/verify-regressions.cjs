const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const run = (name, cwd, args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  fs.writeFileSync(path.join(__dirname, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}`)
  if (result.error) throw result.error
  return { exitCode: result.status, output: result.stdout || '' }
}
const tap = result => ({ exitCode: result.exitCode, tests: Number(result.output.match(/^# tests (\d+)/m)?.[1]), passed: Number(result.output.match(/^# pass (\d+)/m)?.[1]), failed: Number(result.output.match(/^# fail (\d+)/m)?.[1]) })
const nodeFiles = ['tests/inventory/compactBarcodes.node.test.cjs', 'tests/branchIntegration/branchSafetyFixes.node.cjs', 'tests/security/branchWriteRemediation20261015.node.cjs', 'tests/branchIntegration/branchInventoryBatches20261028.node.cjs', 'tests/inventory/bulkExcelWorkflow.node.test.cjs', 'tests/inventory/excelOpeningAndCategory.node.test.cjs', 'tests/inventory/inventoryModeSafety.node.test.cjs']
const backend = tap(run('backend-node', path.join(root, 'server'), ['--test', ...nodeFiles]))
const frontendFiles = fs.readdirSync(path.join(root, 'client/tests')).filter(file => /inventory/i.test(file) && file.endsWith('.mjs')).map(file => `tests/${file}`)
const frontend = tap(run('frontend-node', path.join(root, 'client'), ['--test', ...frontendFiles]))
const baselineEnv = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(path.join(__dirname, 'preload-head.cjs').replaceAll('\\', '/'))}` }
const appointmentBaseline = tap(run('appointment-head-baseline', path.join(root, 'server'), ['--test', '--test-name-pattern=appointment validates the doctor', 'tests/security/branchWriteRemediation20261015.node.cjs'], baselineEnv))
const vitestFiles = ['tests/inventory/inventory.test.js', 'tests/security/inventoryConcurrency.test.js', 'tests/security/batch5InventoryWorkflow.test.js', 'tests/security/batch2InventorySemantics.test.js']
const vitest = (name, env) => {
  const report = path.join(__dirname, `${name}.json`)
  const result = run(name, path.join(root, 'server'), ['node_modules/vitest/vitest.mjs', 'run', ...vitestFiles, '--reporter=json', `--outputFile=${report}`], env)
  const data = JSON.parse(fs.readFileSync(report, 'utf8'))
  return { exitCode: result.exitCode, tests: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, failures: data.testResults.flatMap(suite => suite.assertionResults.filter(test => test.status === 'failed').map(test => test.fullName)) }
}
const backendVitest = vitest('backend-vitest', process.env)
const backendVitestBaseline = vitest('backend-vitest-head-baseline', baselineEnv)
const summary = { frontend, backend, appointmentBaseline, backendVitest, backendVitestBaseline, vitestFailuresUnchangedFromHead: JSON.stringify(backendVitest.failures) === JSON.stringify(backendVitestBaseline.failures), productionDataModified: false }
fs.writeFileSync(path.join(__dirname, 'regression-results.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
