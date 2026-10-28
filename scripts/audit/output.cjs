'use strict'
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const reportDir = path.resolve(root, process.env.CARAIT_AUDIT_DIR || 'docs/audit-2026-10-28-appointments')
const relative = path.relative(path.join(root, 'docs'), reportDir)
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Audit output must be a directory inside workspace docs')
const out = path.join(reportDir, 'evidence')
fs.mkdirSync(out, { recursive: true })
module.exports = { root, reportDir, out }
