const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {acceptedContentHashes}=require('../../scripts/branchMigrations')
const hash=txt=>crypto.createHash('sha256').update(txt).digest('hex')
test('migration checksum accepts only line ending and final newline variants',()=>{
 const sql='CREATE TABLE demo (id INT);\n-- A migration\n'
 const allowed=acceptedContentHashes(sql)
 assert.ok(allowed.has(hash(sql)))
 assert.ok(allowed.has(hash(sql.replace(/\n/g,'\r\n'))))
 assert.ok(allowed.has(hash(sql.trimEnd())))
 assert.ok(!allowed.has(hash(sql.replace('INT','VARCHAR(10)'))))
})

