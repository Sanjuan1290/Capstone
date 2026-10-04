const request = require('supertest')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-queue-display-auth'
process.env.QUEUE_DISPLAY_PIN = '654321'

const { app } = require('../../server')

describe('queue display access control', () => {
  it('does not expose live queue data without a display session', async () => {
    const response = await request(app).get('/api/queue/live')
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('QUEUE_DISPLAY_LOCKED')
  })

  it('rejects an incorrect queue display PIN', async () => {
    const response = await request(app).post('/api/queue/display/unlock').send({ pin: '000000' })
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('INVALID_QUEUE_DISPLAY_PIN')
  })

  it('issues an HttpOnly display session for the correct PIN', async () => {
    const response = await request(app).post('/api/queue/display/unlock').send({ pin: '654321' })
    expect(response.status).toBe(200)
    const cookies = response.headers['set-cookie'] || []
    expect(cookies.some((cookie) => /queue_display_token=/i.test(cookie) && /HttpOnly/i.test(cookie))).toBe(true)
  })
})
