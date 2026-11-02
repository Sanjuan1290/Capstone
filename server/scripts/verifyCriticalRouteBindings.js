'use strict'
// Dependency-free build guard for local router imports. Static module.exports
// contracts are checked without executing the app or touching the database.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const routers = path.join(root, 'routers')
const failures = []
let checked = 0
for (const file of fs.readdirSync(routers).filter(name => name.endsWith('.js'))) {
  const filename = path.join(routers, file)
  const text = fs.readFileSync(filename, 'utf8')
  const pattern = /\b(?:const|let)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*(['"])(\.{1,2}\/[^'"\n]+)\2\s*\)/g
  for (const match of text.matchAll(pattern)) {
    const base = path.resolve(routers, match[3])
    const target = fs.existsSync(base) ? base : `${base}.js`
    if (!fs.existsSync(target)) {
      failures.push(`${file}: imported module missing: ${match[3]}`)
      continue
    }
    const targetText = fs.readFileSync(target, 'utf8')
    const named = /module\.exports\s*=\s*\{([\s\S]*?)\}/m.exec(targetText)
    const exports = new Set(named ? [...named[1].matchAll(/(?:^|,)\s*([\w$]+)(?:\s*:|\s*(?=,|$))/gm)].map(m=>m[1]) : [])
    for (const explicit of targetText.matchAll(/module\.exports\.([\w$]+)\s*=/g)) exports.add(explicit[1])
    if (!exports.size) continue
    for (const raw of match[1].split(',')) {
      const field = raw.split(':')[0].split('=')[0].trim()
      if (!/^[$\w]+$/.test(field)) continue
      checked++
      if (!exports.has(field)) failures.push(`${file}: ${match[3]} does not export ${field}`)
    }
  }
}
if (failures.length) {
  console.error('Route binding verification failed:\n' + failures.join('\n'))
  process.exit(1)
}
console.log(`Route binding verification passed: ${checked} statically exported handler references.`)
