'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const excludedDirectories = new Set([
  '.git', '.aws', '.ssh', '.secrets', 'node_modules', 'dist', 'build', 'coverage',
  '.vite', '.cache', '.npm', '.next', '.turbo', '.wrangler', '.pytest_cache',
  '__pycache__', 'playwright-report', 'test-results', 'tmp', 'temp', 'target',
])
const allowedEnvironmentSamples = new Set(['.env.example', '.env.sample', '.env.template'])
const excludedArchiveExtensions = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz'])
const excludedSecretExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.kdbx'])
const excludedDumpExtensions = new Set(['.dump', '.bak', '.backup', '.sqlite', '.sqlite3', '.db'])
const decoder = new TextDecoder('utf-8', { fatal: true })

function isExcludedPath(relativePath) {
  const parts = relativePath.split('/')
  const lowerParts = parts.map((part) => part.toLowerCase())
  const basename = lowerParts[lowerParts.length - 1] || ''
  const extension = path.posix.extname(basename)
  const directories = lowerParts.slice(0, -1)

  if (directories.some((part) => excludedDirectories.has(part))) return true
  if (directories.some((part) => /^(?:database[-_ ]?)?(?:dumps?|backups?|snapshots?)$/.test(part))) return true
  if (/^allcodes.*\.(?:txt|zip)$/.test(basename) || /^carait.*\.zip$/.test(basename)) return true
  if (excludedArchiveExtensions.has(extension) || excludedSecretExtensions.has(extension) || excludedDumpExtensions.has(extension)) return true
  if (basename === '.env' || (basename.startsWith('.env.') && !allowedEnvironmentSamples.has(basename))) return true
  if (basename.endsWith('.log') || /\.(?:tmp|temp|swp|swo)$/.test(basename) || basename.endsWith('~')) return true
  if (/^(?:id_rsa|id_ed25519)(?:\.|$)/.test(basename)) return true
  if (/^(?:firebase-adminsdk|service-account)[-_.].*\.json$/.test(basename)) return true
  if (/^(?:credentials?|secrets?)(?:[-_.].*)?\.(?:json|ya?ml|txt|enc)$/.test(basename)) return true
  if (/\.(?:sql|mysql)(?:\.gz|\.zip)$/.test(basename)) return true
  if (/(?:^|[-_.])(?:database[-_]?dump|db[-_]?dump|backup|snapshot)(?:[-_.]|$)/.test(basename)) return true
  return false
}

function collectSourceFiles(root, outputs = []) {
  const absoluteRoot = path.resolve(root)
  const excludedOutputs = new Set(outputs.map((output) => path.resolve(output)))
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join('/')
      if (isExcludedPath(relativePath)) continue
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else if (entry.isFile() && !excludedOutputs.has(path.resolve(absolutePath))) {
        files.push({ absolutePath, relativePath })
      }
    }
  }
  visit(absoluteRoot)
  return files.sort((left, right) => left.relativePath < right.relativePath ? -1 : (left.relativePath > right.relativePath ? 1 : 0))
}

function decodeText(buffer) {
  if (buffer.includes(0)) return null
  try {
    return decoder.decode(buffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  } catch {
    return null
  }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < CRC_TABLE.length; index++) {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
  CRC_TABLE[index] = value >>> 0
}

function createZip(entries) {
  if (entries.length > 0xffff) throw new Error('Source ZIP exceeds the classic ZIP entry-count limit.')
  const localParts = []
  const centralParts = []
  let localOffset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.relativePath, 'utf8')
    const data = fs.readFileSync(entry.absolutePath)
    const compressed = zlib.deflateRawSync(data, { level: 9 })
    const checksum = crc32(data)
    if (data.length > 0xffffffff || compressed.length > 0xffffffff || localOffset > 0xffffffff) {
      throw new Error('Source ZIP exceeds the classic ZIP 4 GiB size limit.')
    }

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x0021, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x0021, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, name)
    localOffset += local.length + name.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const localData = Buffer.concat(localParts)
  if (localData.length > 0xffffffff || centralDirectory.length > 0xffffffff) {
    throw new Error('Source ZIP exceeds the classic ZIP 4 GiB size limit.')
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localData.length, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([localData, centralDirectory, end])
}

function generateSourceExports(options = {}) {
  const absoluteRoot = path.resolve(options.root || path.resolve(__dirname, '../..'))
  const absoluteTextPath = path.resolve(options.textPath || path.join(absoluteRoot, 'AllCodes_DEPLOYMENT_FINAL_20261020.txt'))
  const absoluteZipPath = path.resolve(options.zipPath || path.join(absoluteRoot, 'CARAIT_DEPLOYMENT_FINAL_20261020.zip'))
  if (absoluteTextPath === absoluteZipPath) throw new Error('Text and ZIP export paths must be different.')
  const files = collectSourceFiles(absoluteRoot, [absoluteTextPath, absoluteZipPath])
  const readable = []
  const binaries = []
  const zipEntries = []
  for (const file of files) {
    const data = fs.readFileSync(file.absolutePath)
    const text = decodeText(data)
    zipEntries.push(file)
    if (text === null) binaries.push({ path: file.relativePath, size: data.length })
    else readable.push({ path: file.relativePath, text })
  }

  const parts = [
    'CARAIT CLINIC SYSTEM - FINAL SOURCE EXPORT',
    'Readable files: ' + readable.length,
    'Binary assets included in the ZIP: ' + binaries.length,
    '',
  ]
  for (const file of readable) {
    parts.push('===== FILE: ' + file.path + ' =====', file.text, '')
  }
  parts.push('===== BINARY ASSETS INCLUDED IN ZIP =====')
  for (const file of binaries) parts.push(file.path + ' (' + file.size + ' bytes)')
  parts.push('')

  fs.mkdirSync(path.dirname(absoluteTextPath), { recursive: true })
  fs.mkdirSync(path.dirname(absoluteZipPath), { recursive: true })
  fs.writeFileSync(absoluteTextPath, parts.join('\n'), 'utf8')
  fs.writeFileSync(absoluteZipPath, createZip(zipEntries))
  return {
    textPath: absoluteTextPath,
    zipPath: absoluteZipPath,
    readableFiles: readable.length,
    binaryFiles: binaries.length,
    zipEntries: zipEntries.length,
  }
}

module.exports = { isExcludedPath, collectSourceFiles, decodeText, createZip, generateSourceExports }


