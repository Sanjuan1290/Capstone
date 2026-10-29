'use strict'
// Guard against accidentally letting Vitest collect node:test TAP suites again.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..', '..')
const config = fs.readFileSync(path.join(root, 'vitest.config.mjs'), 'utf8')
const runner = fs.readFileSync(path.join(root, 'scripts', 'runNodeRegressionTests.js'), 'utf8')
const pkg = require(path.join(root, 'package.json'))

test('Vitest excludes Node TAP suites without replacing default excludes', () => {
  assert.match(config, /configDefaults\.exclude/)
  assert.match(config, /\*\*\/\*\.node\.cjs/)
  assert.match(config, /\*\*\/\*\.node\.test\.cjs/)
})
test('Node regression runner includes both supported naming conventions', () => {
  assert.match(runner, /endsWith\(\'.node.cjs\'\)/)
  assert.match(runner, /endsWith\(\'.node.test.cjs\'\)/)
})
test('full suite command runs both Vitest and Node regressions', () => {
  assert.equal(pkg.scripts['test:all'], 'npm test && npm run test:node')
})
