// Produces a non-destructive TiDB import candidate from a local MySQL dump.
// The output is reviewed offline and NEVER applied by this script.
// Default schema-only mode excludes all exported patient/account records.
const fs = require('node:fs')
const path = require('node:path')
function convertDump(input, { includeData = false } = {}) {
  if (includeData && process.env.CARAIT_ACKNOWLEDGE_SENSITIVE_DATA !== 'YES') {
    throw new Error('Including patient/account data requires CARAIT_ACKNOWLEDGE_SENSITIVE_DATA=YES and a private destination.')
  }
  if (!input.includes('-- MySQL dump')) throw new Error('Input is not a recognized MySQL dump.')
  const lines = input.split(/\r?\n/)
  const out = [
    '-- CARAIT TiDB import candidate; REVIEW before use in an EMPTY, DISPOSABLE database.',
    '-- Not an upgrade script. Never run on a database with existing data.',
    `-- Sensitive data included: ${includeData ? 'YES' : 'NO'}.`,
    'SET FOREIGN_KEY_CHECKS=0;',
  ]
  let inserted = 0, dropped = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('--')) continue
    // Client-specific mysqldump directives, not schema or row data.
    if (/^\/\*!\d+/.test(trimmed) || /^LOCK TABLES\b/i.test(trimmed) || /^UNLOCK TABLES\b/i.test(trimmed)) { dropped++; continue }
    // Export's DROP TABLE would destroy a preexisting TiDB dataset.
    if (/^DROP TABLE(?: IF EXISTS)?\b/i.test(trimmed)) { dropped++; continue }
    if (/^INSERT INTO\b/i.test(trimmed)) {
      if (includeData) out.push(line)
      inserted++
      continue
    }
    // Any other DML, conditional server commands, or procedural SQL must be reviewed.
    if (/^(?:DELETE|TRUNCATE|REPLACE INTO|UPDATE|CREATE PROCEDURE|CREATE TRIGGER|DELIMITER|CALL)\b/i.test(trimmed)) {
      throw new Error(`Unsupported or potentially destructive statement: ${trimmed.slice(0,80)}`)
    }
    out.push(line)
  }
  out.push('SET FOREIGN_KEY_CHECKS=1;', '')
  return { content: out.join('\n'), countDataStatements: inserted, filteredCommands: dropped }
}
if (require.main === module) {
  try {
    const [inputFile, outputFile, flag] = process.argv.slice(2)
    if (!inputFile || !outputFile || (flag && flag !== '--include-data')) {
      throw new Error('Usage: node scripts/prepareTidbDump.js SOURCE.sql OUTPUT.sql [--include-data]')
    }
    if (path.resolve(inputFile) === path.resolve(outputFile)) throw new Error('Output must differ from source.')
    if (fs.existsSync(outputFile)) throw new Error('Output already exists; will not overwrite.')
    const res = convertDump(fs.readFileSync(inputFile, 'utf8'), { includeData: flag === '--include-data' })
    fs.writeFileSync(outputFile, res.content, { mode: 0o600, flag: 'wx' })
    console.log(`Wrote TiDB import candidate: ${path.resolve(outputFile)}. Data INSERT statements ${flag ? 'retained' : 'removed'}: ${res.countDataStatements}. Removed MySQL-only directives: ${res.filteredCommands}.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { convertDump }

