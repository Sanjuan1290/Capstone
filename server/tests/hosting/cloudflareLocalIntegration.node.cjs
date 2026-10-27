'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const https = require('node:https')
const express = require('express')
const { once } = require('node:events')
const { pathToFileURL } = require('node:url')
const { trustedProxyClientIp } = require('../../middlewares/trustedProxy.middleware')

function createLocalPfx(outputPath) {
  const command = [
    '$ErrorActionPreference = "Stop"',
    '$rsa = [System.Security.Cryptography.RSA]::Create(2048)',
    '$name = [System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new("CN=localhost")',
    '$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new($name, $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)',
    '$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()',
    '$san.AddDnsName("localhost")',
    '$san.AddIpAddress([System.Net.IPAddress]::Parse("127.0.0.1"))',
    '$request.CertificateExtensions.Add($san.Build())',
    '$cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddHours(1))',
    '[System.IO.File]::WriteAllBytes($env:CARAIT_TEST_PFX_PATH, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, "local-test-only"))',
    '$cert.Dispose()',
    '$rsa.Dispose()',
  ].join('; ')
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, CARAIT_TEST_PFX_PATH: outputPath },
    stdio: 'pipe',
  })
}

test('Pages proxy reaches a real local Express service over HTTPS with signed visitor IP and forwarded session/body', {
  skip: process.platform !== 'win32',
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carait-proxy-integration-'))
  const pfxPath = path.join(root, 'local-test-only.pfx')
  const tempBase = path.resolve(os.tmpdir())
  const oldFetch = globalThis.fetch
  const oldTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  const oldProxySecret = process.env.API_PROXY_SECRET
  const secret = 'local-express-proxy-integration-test-secret'
  let server
  try {
    createLocalPfx(pfxPath)
    const app = express()
    app.use(trustedProxyClientIp)
    app.use(express.json())
    app.all('/api/integration', (req, res) => {
      res.cookie('session', 'preserved', { httpOnly: true, secure: true, sameSite: 'lax' })
      res.json({
        method: req.method,
        query: req.query.value,
        body: req.body || null,
        ip: req.ip,
        cookie: req.headers.cookie || '',
        unsignedForwardedIp: req.headers['x-forwarded-for'] || null,
        edgeHeaderVisible: req.headers['cf-connecting-ip'] || null,
      })
    })
    app.get('/api/events', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write('event: connected\n\n')
      res.end()
    })
    server = https.createServer({ pfx: fs.readFileSync(pfxPath), passphrase: 'local-test-only' }, app)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    const apiOrigin = 'https://127.0.0.1:' + address.port
    process.env.API_PROXY_SECRET = secret
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    globalThis.fetch = (url, options) => oldFetch(url, {
      ...options,
      ...(options.body ? { duplex: 'half' } : {}),
    })

    const { onRequest } = await import(pathToFileURL(
      path.resolve(__dirname, '../../../client/functions/api/[[path]].js'),
    ).href)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const body = method === 'GET' ? undefined : JSON.stringify({ method, sample: true })
      const request = new Request('https://clinic.local/api/integration?value=' + method, {
        method,
        headers: {
          'CF-Connecting-IP': '198.51.100.44',
          'X-Forwarded-For': '203.0.113.99',
          Cookie: 'clinic_session=private-session',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
      })
      const response = await onRequest({
        request,
        env: { API_ORIGIN: apiOrigin, API_PROXY_SECRET: secret },
      })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('set-cookie') || '', /session=preserved/)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const result = await response.json()
      assert.equal(result.method, method)
      assert.equal(result.query, method)
      assert.equal(result.ip, '198.51.100.44')
      assert.equal(result.cookie, 'clinic_session=private-session')
      assert.equal(result.unsignedForwardedIp, null)
      assert.equal(result.edgeHeaderVisible, null)
      assert.equal(result.body?.method || null, body ? method : null)
    }

    const stream = await onRequest({
      request: new Request('https://clinic.local/api/events', {
        headers: { 'CF-Connecting-IP': '198.51.100.44', Accept: 'text/event-stream' },
      }),
      env: { API_ORIGIN: apiOrigin, API_PROXY_SECRET: secret },
    })
    assert.equal(stream.headers.get('content-type'), 'text/event-stream')
    assert.equal(await stream.text(), 'event: connected\n\n')

    const direct = await oldFetch(apiOrigin + '/api/integration?value=direct', {
      headers: { 'x-forwarded-for': '203.0.113.77', 'cf-connecting-ip': '203.0.113.77' },
    })
    const directResult = await direct.json()
    assert.notEqual(directResult.ip, '203.0.113.77')
    assert.equal(directResult.unsignedForwardedIp, null)
    assert.equal(directResult.edgeHeaderVisible, null)
  } finally {
    globalThis.fetch = oldFetch
    if (oldTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = oldTlsSetting
    if (oldProxySecret === undefined) delete process.env.API_PROXY_SECRET
    else process.env.API_PROXY_SECRET = oldProxySecret
    if (server) {
      server.close()
      server.closeAllConnections?.()
    }
    assert.ok(root.startsWith(tempBase + path.sep), 'temporary certificate directory remains within the OS temp directory')
    fs.rmSync(root, { recursive: true, force: true })
  }
})
