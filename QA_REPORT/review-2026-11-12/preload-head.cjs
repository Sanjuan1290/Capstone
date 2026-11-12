// Baseline tracked changes in memory only; never revert user's working files.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'server', 'client'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/).filter(Boolean)
const originals = new Map(changed.map(relative => [path.resolve(root, relative), execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8' })]))
const load = Module._extensions['.js'], read = fs.readFileSync
Module._extensions['.js'] = function (module, filename) { return originals.has(filename) ? module._compile(originals.get(filename), filename) : load(module, filename) }
fs.readFileSync = function (file, options) {
  const filename = typeof file === 'string' ? path.resolve(file) : ''
  if (originals.has(filename)) return (typeof options === 'string' ? options : options?.encoding) ? originals.get(filename) : Buffer.from(originals.get(filename))
  return read.apply(this, arguments)
}
