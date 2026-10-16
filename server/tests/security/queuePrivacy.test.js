const fs = require('fs')
const path = require('path')

describe('public queue privacy', () => {
  it('does not expose patient names in the public live queue query', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'routers', 'queue.router.js'), 'utf8')
    expect(source).not.toMatch(/patient_name|full_name\s+AS\s+patient/i)
    expect(source).toContain('queue_number AS queueNo')
  })
})



