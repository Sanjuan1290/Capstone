const request = require('supertest')
const db = require('../../db/connect')

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

  afterEach(() => vi.restoreAllMocks())

  it('requires branch selection even with the correct PIN', async () => {
    const response = await request(app).post('/api/queue/display/unlock').send({ pin: '654321' })
    expect(response.status).toBe(400)
    expect(response.body.message).toContain('branch')
  })

  it('issues a branch-bound HttpOnly session for the correct PIN', async () => {
    const query = vi.spyOn(db, 'query').mockResolvedValue([[{ id: 1, name: 'Laguna Clinic Branch' }]])
    const response = await request(app).post('/api/queue/display/unlock').send({ pin: '654321', branch_id: 1 })
    expect(response.status).toBe(200)
    expect(query).toHaveBeenCalledWith(
      'SELECT id,name FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1',
      [1]
    )
    const cookies = response.headers['set-cookie'] || []
    expect(cookies.some((cookie) => /queue_display_token=/i.test(cookie) && /HttpOnly/i.test(cookie))).toBe(true)
    expect(response.body.branch_name).toBe('Laguna Clinic Branch')
  })

  it('rejects unknown or inactive clinic branches', async () => {
    vi.spyOn(db, 'query').mockResolvedValue([[]])
    const response = await request(app).post('/api/queue/display/unlock').send({ pin: '654321', branch_id: 999 })
    expect(response.status).toBe(404)
    expect(response.body.code).toBe('BRANCH_NOT_FOUND')
  })
})


