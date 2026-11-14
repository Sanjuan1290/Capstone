import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const service = readFileSync(join(root, 'src/services/admin.service.js'), 'utf8')

const namedExports = new Set([...service.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]))
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? walk(path) : /\.(?:mjs|js|jsx)$/.test(entry.name) ? [path] : []
})

test('booking-policy editor has its two required API exports', () => {
  assert.ok(namedExports.has('getBookingPolicyContent'))
  assert.ok(namedExports.has('updateBookingPolicyContent'))
})

test('all named admin.service imports have corresponding exports (protect future merges)', () => {
  const missing = []
  for (const file of walk(join(root, 'src'))) {
    const content = readFileSync(file, 'utf8')
    const matcher = /\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"\n]+)['"]/g
    for (const found of content.matchAll(matcher)) {
      if (!/\bservices\/admin\.service(?:\.js)?$/.test(found[2])) continue
      for (const entry of found[1].split(',')) {
        const name = entry.trim().split(/\s+as\s+/)[0].trim()
        if (name && !namedExports.has(name)) missing.push(`${relative(root, file)}: ${name}`)
      }
    }
  }
  assert.deepEqual(missing, [], `Missing admin.service exports:\n${missing.join('\n')}`)
})

test('policy content methods target the existing branch-aware admin API and use PUT for updates', () => {
  assert.match(service, /export\s+const\s+getBookingPolicyContent\s*=\s*\(\)\s*=>\s*requestJson\(`\$\{getAdminApiBase\(\)\}\/system-setup\/booking-policy\/content`\)/)
  assert.match(service, /export\s+const\s+updateBookingPolicyContent\s*=\s*\(payload\)\s*=>\s*requestJson\(`\$\{getAdminApiBase\(\)\}\/system-setup\/booking-policy\/content`/)
  assert.match(service, /export\s+const\s+updateBookingPolicyContent[^\n]*method:\s*'PUT'/)
  assert.match(service, /export\s+const\s+updateBookingPolicyContent[^\n]*JSON\.stringify\(payload\)/)
})


test('policy endpoints send authenticated GET/PUT requests and preserve content', async () => {
  const withoutImports = service
    .replace("from '../utils/manualAppointment.mjs'", `from '${new URL('../src/utils/manualAppointment.mjs', import.meta.url).href}'`)
    .replace(/^import \{ uploadValidatedImage \} from ['\"]\.\/imageUpload['\"]\s*$/m, '')
    .replace(/^import \{ uploadDiscountProofViaApi \} from ['\"]\.\/discountProofUpload['\"]\s*$/m, '')
  const mod = await import(`data:text/javascript;base64,${Buffer.from(withoutImports).toString('base64')}`)
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ saved: true }),
    }
  }
  try {
    const getResult = await mod.getBookingPolicyContent()
    const payload = { title: 'Appointment Booking Policy', status: 'draft' }
    const putResult = await mod.updateBookingPolicyContent(payload)
    assert.deepEqual(getResult, { saved: true })
    assert.deepEqual(putResult, { saved: true })
    assert.equal(calls[0].url, '/api/admin/system-setup/booking-policy/content')
    assert.equal(calls[0].options.credentials, 'include')
    assert.equal(calls[1].url, '/api/admin/system-setup/booking-policy/content')
    assert.equal(calls[1].options.method, 'PUT')
    assert.equal(calls[1].options.credentials, 'include')
    assert.deepEqual(JSON.parse(calls[1].options.body), payload)
  } finally {
    globalThis.fetch = originalFetch
  }
})
