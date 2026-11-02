const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

// Prevent non-JavaScript content from reaching deployment undetected.
test('all server modules parse before deployment', () => {
  const script = path.resolve(__dirname, '../../scripts/verifyServerSyntax.js')
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Server syntax verification passed/)
})
