const jwt = require('jsonwebtoken')
const { verifySessionToken } = require('../../utils/sessionSecurity')

describe('session revocation', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'security-test-secret' })

  it('rejects a token whose session version is stale', async () => {
    const token = jwt.sign({ id: 4, role: 'staff', session_version: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const executor = { query: vi.fn().mockResolvedValue([[{ id: 4, session_version: 2 }]]) }
    await expect(verifySessionToken(token, 'staff', executor)).rejects.toThrow(/revoked/i)
  })

  it('accepts the current active session version', async () => {
    const token = jwt.sign({ id: 4, role: 'staff', session_version: 2 }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const executor = { query: vi.fn().mockResolvedValue([[{ id: 4, session_version: 2 }]]) }
    await expect(verifySessionToken(token, 'staff', executor)).resolves.toMatchObject({ id: 4, role: 'staff', session_version: 2 })
  })
})
