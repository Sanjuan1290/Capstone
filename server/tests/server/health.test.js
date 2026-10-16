const request = require('supertest')
const { app } = require('../../server')

describe('server health endpoint', () => {
  it('reports that the API process is running', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})



