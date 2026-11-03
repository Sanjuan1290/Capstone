import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { onRequest as redirectPortal } from '../../functions/portal.js'
import { onRequest as redirectPortalChild } from '../../functions/portal/[[path]].js'

const websiteRoot = fileURLToPath(new URL('../', import.meta.url))
const read = (path) => readFileSync(resolve(websiteRoot, path), 'utf8')

test('legacy /portal redirects to the SYSTEM login and keeps query parameters', () => {
  const response = redirectPortal({ request: new Request('https://dc-prime-realty.pages.dev/portal?from=email') })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://dc-prime-realty.pages.dev/system/portal?from=email')
})

test('legacy nested portal routes remain within SYSTEM', () => {
  const response = redirectPortalChild({ request: new Request('https://dc-prime-realty.pages.dev/portal/super_admin/users?page=2') })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://dc-prime-realty.pages.dev/system/portal/super_admin/users?page=2')
})

test('WEBSITE explicitly limits 404 logo dimensions and retains a return-home link', () => {
  const jsx = read('src/website/pages/NotFound.jsx')
  const css = read('src/website/styles/website.css')
  assert.match(jsx, /width="80"/)
  assert.match(jsx, /height="80"/)
  assert.match(jsx, /dc-not-found-mark/)
  assert.match(jsx, /to="\/"/)
  assert.match(css, /dc-not-found-mark\s*\{[^}]*width:80px;[^}]*height:80px/)
})

test('WEBSITE loads scoped utilities for cards, forms, overlays and responsive pages', () => {
  const app = read('src/App.jsx')
  const utilities = read('src/website/styles/website-utilities.css')
  assert.match(app, /import '\.\/website\/styles\/website-utilities\.css'/)
  for (const literal of ['#root .flex', '#root .grid', '#root .fixed', '#root .absolute', '#root .items-center', '#root .justify-between', '#root .rounded-xl', '#root .max-w-', '#root .text-', '#root .bg-', String.raw`sm\:grid-cols-2`]) {
    assert.ok(utilities.includes(literal), `Generated website utilities missing ${literal}`)
  }
  assert.ok(!utilities.includes('html, body { margin: 0'), 'Do not introduce unrelated global resets')
})

test('default CSS sizing remains local to WEBSITE and does not alter HR, FINANCE or SYSTEM', () => {
  const utilities = read('src/website/styles/website-utilities.css')
  assert.ok(utilities.includes(String.raw`#root .max-w-\[720px\]`))
  assert.match(utilities, /#root \.h-20/)
  assert.match(utilities, /#root \.w-20/)
})


test('all literal Tailwind utilities in WEBSITE JSX are present in generated CSS', () => {
  const utilities = read('src/website/styles/website-utilities.css')
  const srcDir = resolve(websiteRoot, 'src')
  const visit = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filename = resolve(dir, entry.name)
    return entry.isDirectory() ? visit(filename) : /\.jsx$/.test(entry.name) ? [filename] : []
  })
  const missing = []
  let checked = 0
  for (const filename of visit(srcDir)) {
    const jsx = readFileSync(filename, 'utf8')
    for (const match of jsx.matchAll(/className="([^"]+)"/g)) {
      for (const token of match[1].split(/\s+/).filter(Boolean)) {
        if (token.startsWith('dc-') || token.startsWith('website-') || token === 'active') continue
        checked += 1
        const escaped = token.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`)
        if (!utilities.includes(`#root .${escaped}`)) missing.push(`${filename}: ${token}`)
      }
    }
  }
  assert.ok(checked > 100, `Unexpectedly few class tokens found: ${checked}`)
  assert.deepEqual(missing, [], `WEBSITE utilities need regeneration:\n${missing.join('\n')}`)
})
