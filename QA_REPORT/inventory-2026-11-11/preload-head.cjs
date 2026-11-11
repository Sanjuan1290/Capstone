// Baseline regression check without changing the working tree or touching a DB.
const Module = require('node:module')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const originals = new Map(['server/utils/barcodes.js', 'server/utils/inventoryBatches.js', 'client/src/pages/shared/Inventory.jsx'].map(relative => [
  path.join(root, relative), execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8' }),
]))
const load = Module._extensions['.js']
Module._extensions['.js'] = function (module, filename) {
  if (originals.has(filename)) return module._compile(originals.get(filename), filename)
  return load(module, filename)
}
const fs = require('node:fs')
const read = fs.readFileSync
fs.readFileSync = function (file, options) {
  const filename = typeof file === 'string' ? path.resolve(file) : ''
  if (originals.has(filename)) {
    const encoding = typeof options === 'string' ? options : options?.encoding
    return encoding ? originals.get(filename) : Buffer.from(originals.get(filename))
  }
  return read.apply(this, arguments)
}
