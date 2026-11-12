'use strict'
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const server = path.resolve(__dirname, '../..')
const read = pathName => fs.readFileSync(path.join(server, pathName), 'utf8')

function mockInventory(query = {}) {
  const rows = [
    {id: 11, branch_id: 1, branch_name: 'Laguna Clinic', name: 'Alcohol Pad', category: 'medical', item_type: 'supplies', base_unit: 'pcs', stock: 50, stock_base: 50, threshold: 5, selling_price: 3, unit: 'pad'},
    {id: 22, branch_id: 2, branch_name: 'Branch B', name: 'Alcohol Pad', category: 'medical', item_type: 'supplies', base_unit: 'pcs', stock: 20, stock_base: 20, threshold: 25, selling_price: 4, unit: 'pad'},
    {id: 33, branch_id: 3, branch_name: 'Branch C', name: 'Alcohol Pad', category: 'medical', item_type: 'supplies', base_unit: 'pcs', stock: 0, stock_base: 0, threshold: 5, selling_price: 2, unit: 'pad'}
  ]
  const db = {query: async (sql, params) => {
    if (sql.includes('FROM clinic_branches')) return [[
      {id: 1, name: 'Laguna Clinic', is_active: 1},
      {id: 2, name: 'Branch B', is_active: 1},
      {id: 3, name: 'Branch C', is_active: 1}
    ].filter(b => !(query.branch_ids && Number(query.branch_ids) !== b.id))]
    if (sql.includes('FROM inventory i JOIN clinic_branches')) return [rows.filter(r => params.includes(r.branch_id))]
    throw new Error(`Unexpected SQL: ${sql}`)
  }}
  const {module: moduleObject, exports} = {module: {exports: {}}, exports: {}}
  const sandbox = {module: moduleObject, exports: moduleObject.exports, require(name) {
    if (name === '../db/connect') return db
    if (name === '../utils/date') return {getTodayDateOnly: () => '2026-11-05', addDaysDateOnly: () => '2026-12-05'}
    if (name === '../utils/allInventoryOverview') return require(path.join(server, 'utils/allInventoryOverview.js'))
    throw Error(`Unexpected import ${name}`)
  }}
  vm.runInNewContext(read('routers/branchAllInventory.js'), sandbox, {filename: 'branchAllInventory.js'})
  const routes = {}
  const router = {get(name, ...handlers) {routes[name] = handlers.at(-1)}}
  moduleObject.exports.registerAllInventory(router, (_req, _res, next) => next())
  return async () => {
    const response = {statusCode: 200, status(code) {this.statusCode = code; return this}, json(value) {this.body = value; return this}}
    await routes['/inventory/all']({query}, response)
    assert.equal(response.statusCode, 200)
    return response.body
  }
}

test('separate inventory items keep their own branch selling prices and values', async () => {
  const result = await mockInventory()()
  assert.equal(result.rows.length, 3)
  assert.equal(result.summary.total_selling_value, 230)
  assert.equal(result.summary.total_items, 3)
  const rows=Object.fromEntries(result.rows.map(r=>[r.branch_id,r]))
  assert.equal(rows[1].quantity_base, 50)
  assert.equal(rows[1].selling_price, 3)
  assert.equal(rows[2].selling_price, 4)
  assert.equal(rows[2].selling_value, 80)
  assert.equal(rows[3].quantity_base, 0)
})

test('low-stock filter returns only the matching branch item and its selling value', async () => {
  const result = await mockInventory({status: 'low'})()
  assert.equal(result.total, 1)
  assert.equal(result.rows[0].id, 22)
  assert.equal(result.rows[0].selling_value, 80)
  assert.equal(result.summary.total_selling_value, 80)
})

test('selecting a branch limits returned rows and values to that branch', async () => {
  const result = await mockInventory({branch_ids: '2'})()
  assert.equal(result.total, 1)
  assert.equal(result.rows[0].id, 22)
  assert.equal(result.rows[0].quantity_base, 20)
  assert.equal(result.summary.total_selling_value, 80)
})

test('a duplicate name inside the same branch does not merge item identity',async()=>{
  const result=await mockInventory()()
  const sameName=result.rows.filter(r=>r.name==='Alcohol Pad')
  assert.equal(sameName.length,3)
  assert.equal(new Set(sameName.map(r=>r.id)).size,3)
})
