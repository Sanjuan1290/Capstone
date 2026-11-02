// Dependency-free regression checks for the saved service-price contract.
// Run with: node --test tests/billing/servicePricingContract.node.test.cjs
// This test deliberately stubs database access; it never contacts TiDB/MySQL.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { Module, createRequire } = require('node:module')

const billingFile = join(__dirname, '..', '..', 'utils', 'billing.js')
const loadBilling = () => {
  const loaded = new Module(billingFile, module)
  const originalRequire = createRequire(billingFile)
  loaded.filename = billingFile
  loaded.paths = Module._nodeModulePaths(dirname(billingFile))
  loaded.require = (request) => request === '../db/connect'
    ? { query() { throw new Error('Regression tests must not query the database') } }
    : originalRequire(request)
  loaded._compile(readFileSync(billingFile, 'utf8'), billingFile)
  return loaded.exports
}
const { computeCatalogServicePricing, hydrateBillingCatalogRows, getServiceMaterialUnitCost } = loadBilling()

const baseService = () => ({
  id: 11,
  branch_id: 1,
  service_name: 'Minor Wound Cleaning and Dressing',
  consultation_fee: 350,
  default_price: 455,
  materials: [
    { inventory_id: 22, quantity: 1, inventory_price: 40, unit_cost_override: 25 },
    { inventory_id: 25, quantity: 1, inventory_price: 65, unit_cost_override: 50 },
  ],
})

test('saved base fee is retained separately from the total patient price', () => {
  const priced = computeCatalogServicePricing(baseService())
  assert.equal(priced.consultation_fee, 350)
  assert.equal(priced.default_price, 455)
  assert.equal(priced.patient_price, 455)
  assert.equal(priced.suggested_price, 455)
  assert.equal(priced.materials.length, 2)
})

test('legacy inventory price, override, and profit inputs never reprice the saved patient total', () => {
  const priced = computeCatalogServicePricing({
    ...baseService(),
    materials: [{ inventory_id: 22, quantity: 7, inventory_price: 300, unit_cost_override: 200 }],
    profit_percentage: 90,
  })
  assert.equal(getServiceMaterialUnitCost(priced.materials[0]), 0)
  assert.equal(priced.patient_price, 455)
  assert.equal(priced.consultation_fee, 350)
  assert.equal(priced.materials_cost, undefined)
  assert.equal(priced.profit_amount, undefined)
})

test('repeated catalog hydration does not double-charge consumables', () => {
  const once = computeCatalogServicePricing(baseService())
  const twice = computeCatalogServicePricing(once)
  const thrice = computeCatalogServicePricing(twice)
  assert.equal(once.patient_price, 455)
  assert.equal(twice.patient_price, 455)
  assert.equal(thrice.patient_price, 455)
  assert.equal(thrice.consultation_fee, 350)
})

test('database catalog hydration returns linked consumables and preserves base/total prices', async () => {
  let queries = 0
  const executor = {
    async query(sql, params) {
      queries++
      assert.match(sql, /FROM billing_service_materials m/)
      assert.deepEqual(params, [11])
      return [[
        { id: 40, billing_service_id: 11, inventory_id: 22, inventory_name: 'Sterile Gloves', material_name: 'Sterile Gloves', quantity: 1, unit_label: 'unit', inventory_price: 40, sort_order: 0 },
        { id: 41, billing_service_id: 11, inventory_id: 25, inventory_name: 'Saline', material_name: 'Saline', quantity: 1, unit_label: 'unit', inventory_price: 65, sort_order: 1 },
      ]]
    },
  }
  const [saved] = await hydrateBillingCatalogRows([{
    id: 11, branch_id: 1, service_name: 'Minor Wound Cleaning and Dressing',
    consultation_fee: '350.00', default_price: '455.00',
  }], executor)
  assert.equal(queries, 1)
  assert.equal(saved.branch_id, 1)
  assert.equal(saved.consultation_fee, 350)
  assert.equal(saved.default_price, 455)
  assert.equal(saved.patient_price, 455)
  assert.deepEqual(saved.materials.map(m => [m.inventory_id, m.quantity]), [[22, 1], [25, 1]])
})

test('the catalog UI labels the full patient charge and retains base-fee context', () => {
  const source = readFileSync(join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'adminPage', 'Admin_BillingCatalog.jsx'), 'utf8')
  assert.match(source, /Total Patient Price<\/th>/)
  assert.match(source, /formatMoney\(patientPrice\(service\)\)/)
  assert.match(source, /formatMoney\(baseServicePrice\(service\)\)/)
  assert.match(source, /canManageServicePricingAtPath/)
})
