// Validate server JavaScript before Render completes `npm ci`.
// Render runs the root npm `postinstall` hook during installation.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const extensions = new Set(['.js', '.cjs', '.mjs'])
const ignored = new Set(['node_modules', '.git', 'coverage', 'dist'])
const files = []
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full)
    else if (extensions.has(path.extname(entry.name))) files.push(full)
  }
}
collect(root)
let failures = 0
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failures += 1
    console.error(`Syntax check failed: ${path.relative(root, file)}`)
    console.error(result.stderr || result.error?.message || `node --check exited ${result.status}`)
  }
}
if (failures) {
  console.error(`Server syntax verification failed: ${failures} of ${files.length} files.`)
  process.exit(1)
}
console.log(`Server syntax verification passed: ${files.length} JavaScript modules.`)

// Syntax checks cannot catch undefined callbacks wired into Express routes.
// This dependency-free route registration test runs during `npm ci` (postinstall)
// so a mismatched handler import fails the build instead of crashing Render.
const routeTest = path.join(root, 'tests/security/staffRouteBindings.node.test.cjs')
const routeResult = spawnSync(process.execPath, ['--test', routeTest], { encoding: 'utf8' })
if (routeResult.status !== 0) {
  console.error('Staff route registration validation failed. The server may fail at startup.')
  console.error(routeResult.stdout || '')
  console.error(routeResult.stderr || routeResult.error?.message || '')
  process.exit(1)
}
console.log('Staff route registration validation passed.')
