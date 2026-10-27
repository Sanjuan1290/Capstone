'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { generateSourceExports } = require('../../scripts/sourceExport')

function readZipNames(zip) {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const endOffset = zip.lastIndexOf(endSignature)
  assert.notEqual(endOffset, -1, 'ZIP end-of-central-directory record exists')
  const entryCount = zip.readUInt16LE(endOffset + 10)
  let offset = zip.readUInt32LE(endOffset + 16)
  const entries = []
  for (let index = 0; index < entryCount; index++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'central directory entry signature')
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const localOffset = zip.readUInt32LE(offset + 42)
    const localNameLength = zip.readUInt16LE(localOffset + 26)
    const localExtraLength = zip.readUInt16LE(localOffset + 28)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const compressed = zip.subarray(dataOffset, dataOffset + compressedSize)
    const content = zip.readUInt16LE(offset + 10) === 8 ? zlib.inflateRawSync(compressed) : compressed
    entries.push({ name, content })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

test('source export excludes credentials, generated outputs, dumps, builds, dependencies, and temp files', () => {
  const tempBase = path.resolve(os.tmpdir())
  const root = fs.mkdtempSync(path.join(tempBase, 'carait-source-export-'))
  try {
    const write = (relative, content) => {
      const destination = path.join(root, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, content)
    }
    write('README.md', 'CAR AIT source')
    write('src/app.js', 'export const answer = 42\n')
    write('server/.env', 'DB_PASSWORD=private-value')
    write('server/.env.example', 'DB_PASSWORD=\n')
    write('server/.env.production', 'JWT_SECRET=private-value')
    write('server/node_modules/pkg/index.js', 'must be excluded')
    write('client/dist/assets/app.js', 'must be excluded')
    write('AllCodes_OLD.txt', 'old export must be excluded')
    write('CARAIT_OLD.zip', 'old archive must be excluded')
    write('backups/clinic_dump.sql', 'INSERT INTO patients VALUES (1)')
    write('Dump20261020.sql', 'INSERT INTO patients VALUES (42)')
    write('wholedatabase.sql', 'INSERT INTO patients VALUES (99)')
    write('QA_PAYMONGO_TEST_IMPLEMENTATION_20261016.md', 'stale QA artifact')
    write('data/clinic.sqlite', Buffer.from([0x53, 0x51, 0x4c, 0x00]))
    write('tmp/run.log', 'temporary')
    write('credentials.json', '{"token":"private-value"}')
    write('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))
    write('server/db/migrations/2026-10-foundation.sql', 'CREATE TABLE clinic_branches (id INT);')

    const first = generateSourceExports({ root })
    assert.equal(path.dirname(first.textPath), path.join(root, '.release-artifacts'))
    assert.equal(path.dirname(first.zipPath), path.join(root, '.release-artifacts'))
    const firstText = fs.readFileSync(first.textPath, 'utf8')
    const firstZip = fs.readFileSync(first.zipPath)
    const entries = readZipNames(firstZip)
    const names = entries.map((entry) => entry.name)
    assert.match(firstText, /===== FILE: src\/app\.js =====/)
    assert.match(firstText, /===== FILE: server\/\.env\.example =====/)
    assert.match(firstText, /server\/db\/migrations\/2026-10-foundation\.sql/)
    assert.match(firstText, /assets\/logo\.png \(\d+ bytes\)/)
    for (const sensitive of ['private-value', 'server/.env ', 'server/.env.production', 'credentials.json', 'clinic_dump.sql', 'clinic.sqlite', 'Dump20261020.sql', 'wholedatabase.sql', 'stale QA artifact']) {
      assert.equal(firstText.includes(sensitive), false, 'text export excludes ' + sensitive)
    }
    assert.deepEqual(names, names.slice().sort())
    assert.ok(names.includes('assets/logo.png'), 'ZIP preserves binary project assets')
    assert.ok(names.includes('server/.env.example'), 'ZIP keeps example environment settings')
    assert.ok(names.includes('server/db/migrations/2026-10-foundation.sql'), 'ZIP keeps migration source')
    for (const excluded of ['server/.env', 'server/.env.production', 'credentials.json', 'backups/clinic_dump.sql', 'Dump20261020.sql', 'wholedatabase.sql', 'QA_PAYMONGO_TEST_IMPLEMENTATION_20261016.md', 'data/clinic.sqlite', 'AllCodes_OLD.txt', 'CARAIT_OLD.zip']) {
      assert.equal(names.includes(excluded), false, 'ZIP excludes ' + excluded)
    }
    const logo = entries.find((entry) => entry.name === 'assets/logo.png')
    assert.deepEqual(logo.content, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))

    const second = generateSourceExports({ root })
    assert.deepEqual(fs.readFileSync(second.textPath), fs.readFileSync(first.textPath))
    assert.deepEqual(fs.readFileSync(second.zipPath), firstZip)
    assert.equal(first.readableFiles, second.readableFiles)
    assert.equal(first.zipEntries, second.zipEntries)
  } finally {
    assert.ok(root.startsWith(tempBase + path.sep), 'temporary export test directory remains within the OS temp directory')
    fs.rmSync(root, { recursive: true, force: true })
  }
})
