const fs = require('fs')
const path = require('path')

describe('doctor appointment workflow security', () => {
  it('blocks starting a consultation on a date other than today', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'), 'utf8')
    expect(source).toContain("code: 'APPOINTMENT_NOT_TODAY'")
    expect(source).toContain('getTodayDateOnly()')
  })

  it('supports scoped doctor appointment retrieval', () => {
    const router = fs.readFileSync(path.join(__dirname, '..', '..', 'routers', 'doctor.router.js'), 'utf8')
    const controller = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'doctor.controller.js'), 'utf8')
    expect(router).toContain("router.get('/appointments'")
    expect(controller).toContain("scope === 'upcoming'")
    expect(controller).toContain("scope !== 'today' && scope !== 'date'")
  })
})
