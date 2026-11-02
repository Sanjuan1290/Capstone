// Dependency-free runtime route-registration test.
// It catches undefined Express callbacks that `node --check` cannot detect.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const routers = path.resolve(__dirname, '../../routers')
const callback = function fakeCallback(_req, _res, next) { if (next) next() }
const callableModule = new Proxy(callback, {
  get(target, property) {
    if (property === 'then') return undefined
    if (property in target) return target[property]
    return callback
  },
})

function loadCommonJs(filename, customRequire) {
  const mod = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: mod,
    exports: mod.exports,
    require: customRequire,
    __dirname: path.dirname(filename),
    __filename: filename,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
  }, {filename})
  return mod.exports
}

// Isolate the controller's *own* exported route functions from database, audit and
// other side-effecting dependencies. New relative imports should not invalidate
// this route test merely because the test's mock allowlist is out of date.
// Still reject missing dependency files; a source-graph problem is a real error.
function mockControllerDependency(moduleName, filename) {
    if (!moduleName.startsWith('.')) {
      throw new Error(`Unexpected non-relative controller dependency: ${moduleName}`)
    }
    const resolved = path.resolve(path.dirname(filename), moduleName)
    const valid = [resolved, `${resolved}.js`, `${resolved}.cjs`, path.join(resolved, 'index.js')]
      .some(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    if (!valid) {
      throw new Error(`Missing controller dependency: ${moduleName}`)
    }
    // Dependency methods are not called by route registration, and must not
    // connect to TiDB, send notifications or write audit logs in this test.
    return callableModule
}

function loadSetupHandlers() {
  const filename = path.join(routers, 'branchSystemWrites.js')
  return loadCommonJs(filename, moduleName => mockControllerDependency(moduleName, filename))
}

function registerRoutes(handlers) {
  const registered = []
  const router = {}
  for (const method of ['get', 'post', 'put', 'delete', 'patch', 'all', 'options', 'head', 'use']) {
    router[method] = (url, ...callbacks) => {
      assert.ok(typeof url === 'string', `${method}: route path must be a string`)
      assert.ok(callbacks.length > 0, `${method.toUpperCase()} ${url}: no route handler`)
      for (const [index, handler] of callbacks.entries()) {
        assert.equal(typeof handler, 'function', `${method.toUpperCase()} ${url} callback ${index + 1} is ${typeof handler} (undefined handler or middleware import)`)
      }
      registered.push({method, url, callbacks})
      return router
    }
  }
  const express = Object.assign(() => router, { Router: () => router, raw: () => callback })
  const fakeRequire = moduleName => {
    if (moduleName === 'express') return express
    if (moduleName === './branchSystemWrites') return handlers
    if (moduleName.endsWith('staffPermission.middleware')) return {
      requireStaffPermission: () => callback,
      requireAnyStaffPermission: () => callback,
    }
    if (moduleName.endsWith('rateLimit.middleware')) return callableModule
    if (moduleName.endsWith('auth.middleware') || moduleName.endsWith('role.middleware') || moduleName.endsWith('branchScope.middleware')) return () => callback
    return callableModule
  }
  loadCommonJs(path.join(routers, 'staff.router.js'), fakeRequire)
  return registered
}

test('Staff router registers only callable Express handlers', () => {
  const handlers = loadSetupHandlers()
  const routes = registerRoutes(handlers)
  assert.ok(routes.length >= 80, `Expected all Staff routes to be checked, got ${routes.length}`)
})

test('Staff Service Category DELETE uses actual category-deletion handler', () => {
  const handlers = loadSetupHandlers()
  assert.equal(typeof handlers.deleteCategory, 'function', 'branchSystemWrites.js must export deleteCategory')
  const route = registerRoutes(handlers).find(route =>
    route.method === 'delete' && route.url === '/admin-access/system-setup/service-categories/:id'
  )
  assert.ok(route, 'Staff Service Category DELETE route is missing')
  assert.equal(route.callbacks.at(-1), handlers.deleteCategory, 'Route must use deleteCategory to preserve delete-in-use checks')
})

test('regression: undeclared category-deletion handler would crash route registration', () => {
  const handlers = {...loadSetupHandlers(), deleteCategory: undefined}
  assert.throws(() => registerRoutes(handlers), /DELETE \/admin-access\/system-setup\/service-categories\/:id callback .* undefined/)
})

// Adding a valid dependency to branchSystemWrites must not break the route
// registration guard. The exported route functions (not the dependency allowlist)
// are what this test is meant to validate.
test('regression: new controller dependency does not hide missing Express callbacks', () => {
  const handlers = loadSetupHandlers()
  const routes = registerRoutes(handlers)
  assert.ok(routes.some(route => route.method === 'delete' && route.url === '/admin-access/system-setup/service-categories/:id'))
  assert.throws(
    () => registerRoutes({...handlers, deleteCategory: undefined}),
    /DELETE \/admin-access\/system-setup\/service-categories\/:id callback .* undefined/
  )
})

test('regression: missing controller dependencies still fail verification', () => {
  const filename = path.join(routers, 'branchSystemWrites.js')
  assert.throws(
    () => mockControllerDependency('../utils/does-not-exist-in-clinic', filename),
    /Missing controller dependency/
  )
})
