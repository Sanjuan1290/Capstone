'use strict'
// Static discovery only. Candidate SQL mismatches need manual confirmation.
const fs = require('node:fs')
const path = require('node:path')
const parser = require('../../client/node_modules/@babel/parser')
const root = path.resolve(__dirname, '../..')
const out = path.join(root, 'docs/audit-2026-10-28/evidence')
const schema = JSON.parse(fs.readFileSync(path.join(out, 'backup-audit.json'))).schema
const coverageFile=path.join(out,'coverage/coverage-summary.json')
const coverage=fs.existsSync(coverageFile)?JSON.parse(fs.readFileSync(coverageFile)):{}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (['node_modules', '.git', 'dist', 'coverage', '__pycache__'].includes(entry.name)) return []
  const file = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(file) : /\.(js|jsx|cjs|mjs)$/.test(file) ? [file] : []
})
const files = ['server', 'client/src', 'client/functions', 'client/tests', 'tests', 'scripts'].flatMap(dir => walk(path.join(root, dir)))
const testFiles = files.filter(file => /[/\\]tests[/\\]/.test(file))
const tests = testFiles.map(file => ({ file: path.relative(root, file).replace(/\\/g, '/'), source: fs.readFileSync(file, 'utf8') }))
const inventory = [], sqlCandidates = [], parseErrors = [], readQueries = []
const visit = (node, fn) => {
  if (!node || typeof node !== 'object') return
  if (node.type) fn(node)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'comments', 'tokens', 'extra'].includes(key)) continue
    if (Array.isArray(value)) value.forEach(child => visit(child, fn))
    else if (value && typeof value === 'object') visit(value, fn)
  }
}
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const item = { file: rel, lines: source.split('\n').length, functions: [], routes: [], imports: [], sqlLiterals: 0, directTestReferences: [], vitestCoverage:coverage[file]||null }
  let ast
  try { ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'], allowReturnOutsideFunction: true }) }
  catch (error) { parseErrors.push({ file: rel, line: error.loc?.line, reason: error.reasonCode }); continue }
  visit(ast, node => {
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && ['query','execute'].includes(node.callee.property?.name)
      && !/[/\\](?:tests|scripts)[/\\]/.test(file)) {
      const arg=node.arguments[0]
      const sql=arg?.type==='StringLiteral'?arg.value:arg?.type==='TemplateLiteral'&&!arg.expressions.length?arg.quasis[0].value.cooked:null
      if(sql&&/^\s*SELECT\b/i.test(sql)&&!/\b(?:GET_LOCK|RELEASE_LOCK|SLEEP|BENCHMARK|INTO\s+(?:OUTFILE|DUMPFILE))\b|;/i.test(sql))readQueries.push({file:rel,line:node.loc.start.line,sql})
    }
    if (node.type === 'FunctionDeclaration' && node.id) item.functions.push({ name: node.id.name, line: node.loc.start.line })
    if (node.type === 'VariableDeclarator' && /FunctionExpression$/.test(node.init?.type || '')) item.functions.push({ name: node.id.name, line: node.loc.start.line })
    if (node.type === 'ImportDeclaration') item.imports.push(node.source.value)
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && ['get','post','put','patch','delete','use'].includes(node.callee.property?.name)) {
      const target = node.arguments[0]
      if (target?.type === 'StringLiteral' || target?.type === 'TemplateLiteral') item.routes.push({ method: node.callee.property.name.toUpperCase(), path: target.value || source.slice(target.start + 1, target.end - 1), line: node.loc.start.line })
    }
    if (node.type !== 'StringLiteral' && node.type !== 'TemplateLiteral') return
    const literal = node.type === 'StringLiteral' ? node.value : node.quasis.map(v => v.value.cooked).join(' __DYNAMIC__ ')
    if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(literal || '')) return
    item.sqlLiterals++
    if (/[/\\]tests[/\\]|[/\\]scripts[/\\]|[/\\]schema/.test(file)) return
    const aliases = new Map()
    const keywords = new Set(['where','set','on','left','right','inner','outer','join','group','order','limit','for','values','as','union','having','and'])
    for (const match of literal.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?/gi)) {
      const [, table, alias] = match
      if (!schema[table]) continue
      aliases.set(table, table)
      if (alias && !keywords.has(alias.toLowerCase())) aliases.set(alias, table)
    }
    for (const match of literal.matchAll(/\b(\w+)\.([A-Za-z_]\w*)/g)) {
      const table = aliases.get(match[1])
      if (table && match[2] !== '__DYNAMIC__' && !schema[table].columns[match[2]]) sqlCandidates.push({ file: rel, line: node.loc.start.line, table, column: match[2] })
    }
    const insert = /^\s*INSERT(?: IGNORE)? INTO\s+`?(\w+)`?\s*\(([^)]+)\)/i.exec(literal)
    if (insert && schema[insert[1]]) for (const col of insert[2].split(',').map(v => v.trim().replace(/`/g,''))) {
      if (/^\w+$/.test(col) && col !== '__DYNAMIC__' && !schema[insert[1]].columns[col]) sqlCandidates.push({ file: rel, line: node.loc.start.line, table: insert[1], column: col })
    }
  })
  if (!rel.includes('/tests/')) for (const test of tests) {
    const base = path.basename(file)
    if (test.source.includes(base) || test.source.includes(rel.replace(/\.(jsx?|mjs|cjs)$/,''))) item.directTestReferences.push(test.file)
  }
  inventory.push(item)
}
const unique = [...new Map(sqlCandidates.map(v => [JSON.stringify(v), v])).values()]
const result = { fileCount: inventory.length, totalLines: inventory.reduce((sum,v)=>sum+v.lines,0), parseErrors, sqlCandidates: unique, readQueries, testFileCount: tests.length, sourceInspectionTestFiles: tests.filter(t => /readFileSync/.test(t.source)).length, inventory, limitations: ['Direct test references are textual associations, not measured execution coverage.', 'SQL matching is conservative and does not resolve derived-table aliases, interpolation, dynamic identifiers or unqualified SELECT columns.', 'Parsing a file does not verify its runtime workflows.'] }
fs.writeFileSync(path.join(out, 'source-inventory.json'), JSON.stringify(result,null,2)+'\n')
const md = ['# Source inventory', '', 'Static discovery; direct references do not establish behavioral coverage. Coverage percentages are Vitest only; standalone Node and browser runs are not included.', '', '| File | Lines | SQL literals | Direct test file references | Vitest line coverage |', '| --- | ---: | ---: | ---: | ---: |', ...inventory.map(v=>`| ${v.file} | ${v.lines} | ${v.sqlLiterals} | ${v.directTestReferences.length} | ${v.vitestCoverage?String(v.vitestCoverage.lines.pct)+'%':'not measured'} |`)]
fs.writeFileSync(path.join(out, '../MODULE_INVENTORY.md'),md.join('\n')+'\n')
console.log(JSON.stringify({ ...result, inventory: undefined, readQueries:readQueries.length }, null, 2))
