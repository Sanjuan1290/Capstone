// Dependency-free Node regression suite, portable across Windows/macOS/Linux.
const { readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const walk = dir => readdirSync(dir, { withFileTypes:true }).flatMap(entry => {
  const file = join(dir, entry.name)
  return entry.isDirectory() ? walk(file) : entry.name.endsWith('.node.cjs') ? [file] : []
})
const files = walk(resolve(__dirname,'../tests')).sort()
if (!files.length) { console.error('No Node regression tests found'); process.exit(1) }
const result = spawnSync(process.execPath, ['--test', ...files], { stdio:'inherit' })
process.exit(result.status === null ? 1 : result.status)

