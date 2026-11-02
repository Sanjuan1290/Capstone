'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const router = fs.readFileSync(path.join(root,'routers/staff.router.js'), 'utf8')
const writes = fs.readFileSync(path.join(root,'routers/branchSystemWrites.js'), 'utf8')

test('Staff delete category route uses the exported handler rather than undefined deactivateCategory', () => {
  assert.match(router, /\bsaveCategory\s*,\s*deleteCategory\s*}\s*=\s*require\(['"]\.\/branchSystemWrites['"]\)/)
  assert.match(router, /router\.delete\('\/admin-access\/system-setup\/service-categories\/:id'[^\n]*\bdeleteCategory\)/)
  assert.match(writes,/module\.exports\s*=\s*\{[^\n]*\bdeleteCategory\b/)
  assert.doesNotMatch(router, /\bdeactivateCategory\b/)
})

test('all local named router exports are verified before deployment', () => {
  const script = path.join(root,'scripts/verifyCriticalRouteBindings.js')
  const result = spawnSync(process.execPath,[script],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr||result.stdout)
  assert.match(result.stdout,/Route binding verification passed/)
})

test('migration registration points only to existing checked-in SQL files', () => {
  const {migrationFiles} = require('../../scripts/branchMigrations')
  const names=new Set()
  for(const name of migrationFiles){
    assert(!names.has(name),`Duplicate migration: ${name}`)
    names.add(name)
    assert(fs.existsSync(path.join(root,'db/migrations',name)),`Missing migration: ${name}`)
  }
})

test('postinstall runs syntax and handler export checks',()=>{
  const scripts=require('../../package.json').scripts
  assert.match(scripts.postinstall,/verifyServerSyntax\.js/)
  assert.match(scripts.postinstall,/verifyCriticalRouteBindings\.js/)
})
