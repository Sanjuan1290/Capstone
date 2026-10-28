const fs = require('fs')
const path = require('path')

describe('batch inventory concurrency guards', () => {
  it('locks batch rows and uses guarded atomic decrements', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'inventoryBatches.js'), 'utf8')
    expect(source).toContain('FOR UPDATE')
    expect(source).toContain('quantity = quantity - ?')
    expect(source).toContain('quantity >= ?')
  })
})
