const fs = require('fs')
const path = require('path')

describe('SQL injection regression guard', () => {
  it('does not interpolate request properties directly into SQL templates', () => {
    const root = path.join(__dirname, '..', '..')
    const dirs = ['controllers', 'utils']
    const offenders = []
    for (const dir of dirs) {
      for (const file of fs.readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(root, dir, file), 'utf8')
        const sqlInterpolation = /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|ORDER BY)[\s\S]{0,500}\$\{\s*req\.(?:body|query|params)/gi
        if (sqlInterpolation.test(source)) offenders.push(`${dir}/${file}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
