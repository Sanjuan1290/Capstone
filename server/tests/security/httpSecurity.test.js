const { securityHeaders, originGuard } = require('../../middlewares/httpSecurity.middleware')

describe('HTTP security middleware', () => {
  it('sets defensive browser headers', () => {
    const headers = {}
    const req = {}
    const res = { setHeader: (key, value) => { headers[key] = value } }
    const next = vi.fn()
    securityHeaders(req, res, next)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(next).toHaveBeenCalled()
  })

  it('rejects an untrusted Origin on authenticated mutations', () => {
    process.env.CLIENT_URL = 'https://clinic.example'
    process.env.NODE_ENV = 'production'
    const req = {
      method: 'POST', cookies: { staff_token: 'x' }, ip: '127.0.0.1', originalUrl: '/api/staff/test',
      get: (name) => name.toLowerCase() === 'origin' ? 'https://evil.example' : undefined,
    }
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json: vi.fn() }
    const next = vi.fn()
    originGuard(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
    process.env.NODE_ENV = 'test'
  })
})
