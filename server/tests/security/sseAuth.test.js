const request = require('supertest')
const { app } = require('../../server')

describe('SSE access control', () => {
  it('rejects the ambiguous generic realtime endpoint', async () => {
    const response = await request(app).get('/api/events')
    expect(response.status).toBe(410)
    expect(response.body?.code).toBe('SSE_ROLE_REQUIRED')
  })

  it('does not allow an unauthenticated browser to subscribe to a role-scoped private stream', async () => {
    const response = await request(app).get('/api/events/admin')
    expect(response.status).toBe(401)
  })
})
