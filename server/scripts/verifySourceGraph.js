const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..', '..')
const serverRoot = path.join(projectRoot, 'server')
const clientRoot = path.join(projectRoot, 'client', 'src')

const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.json', '.css']
const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs'])
const IGNORED_DIRS = new Set(['node_modules', 'coverage', 'dist', '.git'])

const walk = (root) => {
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) files.push(full)
    }
  }
  if (fs.existsSync(root)) visit(root)
  return files
}

// Remove comments before scanning so examples in comments do not become false missing imports.
// Preserve quoted strings because import/require specifiers live inside them.
const stripComments = (source) => {
  let out = ''
  let i = 0
  let state = 'code'
  let quote = ''
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 2; continue }
      if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 2; continue }
      if (ch === '"' || ch === "'" || ch === '`') { state = 'string'; quote = ch; out += ch; i += 1; continue }
      out += ch; i += 1; continue
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += '\n' } else out += ' '
      i += 1; continue
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 2 }
      else { out += ch === '\n' ? '\n' : ' '; i += 1 }
      continue
    }
    if (state === 'string') {
      out += ch
      if (ch === '\\' && i + 1 < source.length) { out += source[i + 1]; i += 2; continue }
      if (ch === quote) { state = 'code'; quote = '' }
      i += 1
    }
  }
  return out
}

const resolveRelative = (fromFile, specifier) => {
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base]
  const ext = path.extname(base)
  if (!SOURCE_EXTENSIONS.includes(ext)) {
    for (const candidateExt of SOURCE_EXTENSIONS) candidates.push(`${base}${candidateExt}`)
    for (const candidateExt of SOURCE_EXTENSIONS) candidates.push(path.join(base, `index${candidateExt}`))
  }
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null
}

const collectSpecifiers = (file, source) => {
  const cleaned = stripComments(source)
  const specs = []
  const patterns = [
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'";]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(cleaned))) specs.push(match[1])
  }
  return specs.filter((specifier) => specifier.startsWith('.'))
}

const roots = [serverRoot, clientRoot]
const missing = []
let scannedFiles = 0
let relativeImports = 0

for (const root of roots) {
  for (const file of walk(root)) {
    scannedFiles += 1
    const source = fs.readFileSync(file, 'utf8')
    for (const specifier of collectSpecifiers(file, source)) {
      relativeImports += 1
      if (!resolveRelative(file, specifier)) {
        missing.push({
          file: path.relative(projectRoot, file).replace(/\\/g, '/'),
          specifier,
        })
      }
    }
  }
}

if (missing.length) {
  console.error(`Source graph verification failed: ${missing.length} missing relative module(s).`)
  for (const item of missing) console.error(` - ${item.file} -> ${item.specifier}`)
  process.exitCode = 1
} else {
  console.log(`Source graph verification passed: ${scannedFiles} source files, ${relativeImports} relative imports resolved.`)
}
