const fs = require('node:fs')
const vm = require('node:vm')
// Execute the actual registered analytics/all and analytics/trends handlers.
// Isolate only their dependencies; do not duplicate their SQL in the test.
module.exports = function reportRoutes(db, from = '2026-11-01', to = '2026-11-13') {
  const source = fs.readFileSync(require.resolve('../../routers/branches.router'), 'utf8')
  const start = source.indexOf("router.get('/analytics/all'")
  const end = source.indexOf('// Detailed reports', start)
  if (start < 0 || end < start) throw new Error('Analytics route boundaries not found')
  const routes = {}
  vm.runInNewContext(source.slice(start, end), {
    router: { get: (route, ...handlers) => { routes[route] = handlers.at(-1) } },
    db, requireSuper: () => {}, reportRange: () => ({ from, to }),
    validId: value => Number.isSafeInteger(value) && value > 0,
  })
  return routes
}
