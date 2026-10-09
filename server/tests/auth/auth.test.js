const jwt = require('jsonwebtoken')
const generateToken = require('../../utils/generateToken')

describe('authentication tokens', () => {
  it('signs a role-aware token that can be verified', () => {
    process.env.JWT_SECRET = 'test-secret'
    const token = generateToken({ id: 7, role: 'staff' })
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    expect(payload.id).toBe(7)
    expect(payload.role).toBe('staff')
  })
})

