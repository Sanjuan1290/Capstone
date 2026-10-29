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
    const previousClientUrl = process.env.CLIENT_URL
    const previousNodeEnv = process.env.NODE_ENV
    // Capture this expected security warning instead of printing a false alarm
    // in every successful test run. Production warning behavior is unchanged.
    const securityWarning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
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
      expect(res.json).toHaveBeenCalledWith({
        code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.',
      })
      expect(next).not.toHaveBeenCalled()
      expect(securityWarning).toHaveBeenCalledWith('[security] rejected origin', {
        origin: 'https://evil.example', method: 'POST', path: '/api/staff/test', ip: '127.0.0.1',
      })
    } finally {
      securityWarning.mockRestore()
      if (previousClientUrl === undefined) delete process.env.CLIENT_URL
      else process.env.CLIENT_URL = previousClientUrl
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  })
})

