const request = require('supertest')
const { app } = require('../../server')

describe('SSE access control', () => {
  it('does not allow an unauthenticated browser to subscribe to live private events', async () => {
    const response = await request(app).get('/api/events?role=admin&userId=1')
    expect(response.status).toBe(401)
  })
})
