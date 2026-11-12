// Read-only baseline reproduction: serve HEAD source to fs readers. Never
// replaces the working tree, reads environment files, or connects to a database.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..'), original = fs.readFileSync, cache = new Map()
fs.readFileSync = function (file, options) {
  if (typeof file === 'string' && /\.(?:js|cjs|mjs|jsx)$/.test(file)) {
    const relative = path.relative(root, path.resolve(file)).replaceAll('\\', '/')
    if (!relative.startsWith('../') && !relative.includes('node_modules/') && !relative.startsWith('QA_REPORT/')) {
      if (!cache.has(relative)) {
        try { cache.set(relative, execFileSync('git', ['show', 'HEAD:' + relative], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })) }
        catch { cache.set(relative, null) }
      }
      const data = cache.get(relative)
      if (data) { const encoding = typeof options === 'string' ? options : options?.encoding; return encoding ? data.toString(encoding) : Buffer.from(data) }
    }
  }
  return original.apply(this, arguments)
}
