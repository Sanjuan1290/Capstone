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

        // Inspect each JavaScript template literal independently. The previous
        // guard scanned 500 characters after any SQL keyword, which could flag
        // unrelated template literals (for example an audit-log entity ID)
        // located after a parameterized SQL query.
        const templateLiterals = source.match(/`(?:\\.|[^`])*`/gs) || []
        const hasUnsafeSqlInterpolation = templateLiterals.some((literal) => (
          /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|ORDER\s+BY)\b/i.test(literal)
          && /\$\{\s*req\.(?:body|query|params)\b/i.test(literal)
        ))

        if (hasUnsafeSqlInterpolation) offenders.push(`${dir}/${file}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
