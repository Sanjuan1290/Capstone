'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { verifyFoundationSchema, ensureFoundationRekeys, foundationContract } = require('../../scripts/foundationSchema')
const { createFoundationSchemaFixture, migrationSource } = require('../helpers/foundationSchemaFixture.cjs')

test('deployment verifier runs the full foundation contract as a read-only staging gate', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/verifyDeployment.js'), 'utf8')
  assert.match(source, /await verifyFoundationSchema\(db,\s*foundationMigration\)/)
})

test('complete foundation contract validates all migration columns, indexes, constraints, and seeds', async () => {
  const fixture = createFoundationSchemaFixture()
  const result = await verifyFoundationSchema(fixture.db, migrationSource)
  const contract = foundationContract(migrationSource)
  assert.equal(result.tables, 28)
  assert.equal(result.ownershipColumns, 27)
  assert.equal(result.indexes, contract.indexes.length)
  assert.equal(result.foreignKeys, 5)
  assert.deepEqual(result.seeds, ['clinic_branches:1', 'branch_booking_settings:1', 'admins:1'])
  assert.ok(contract.indexes.some((index) => index.name === 'uniq_branch_service_name'
    && index.unique && index.columns.join(',') === 'branch_id,service_name,clinic_type'))
  assert.ok(contract.indexes.some((index) => index.name === 'uniq_branch_inventory_barcode'
    && index.unique && index.columns.join(',') === 'branch_id,barcode'))
})

test('foundation verifier identifies missing tables and incompatible ownership column definitions', async () => {
  const missingTable = createFoundationSchemaFixture({ omitTables: ['branch_stock_transfer_requests'] })
  await assert.rejects(verifyFoundationSchema(missingTable.db, migrationSource), /missing tables .*branch_stock_transfer_requests/)

  const missingColumn = createFoundationSchemaFixture({ omitColumns: ['inventory.branch_id'] })
  await assert.rejects(verifyFoundationSchema(missingColumn.db, migrationSource), /missing or incompatible columns: .*inventory\.branch_id \(missing\)/)

  const wrongDefault = createFoundationSchemaFixture({
    columnOverrides: { 'branch_booking_settings.online_min_lead_minutes': { COLUMN_DEFAULT: '0' } },
  })
  await assert.rejects(verifyFoundationSchema(wrongDefault.db, migrationSource), /online_min_lead_minutes \(default 0 \(expected 720\)\)/)
})

test('foundation verifier rejects wrong index definitions and residual global unique indexes', async () => {
  const missing = createFoundationSchemaFixture({ omitIndexes: ['billing_service_catalog.uniq_branch_service_name'] })
  await assert.rejects(verifyFoundationSchema(missing.db, migrationSource), /uniq_branch_service_name expected UNIQUE \(branch_id,service_name,clinic_type\)/)

  const wrong = createFoundationSchemaFixture({
    indexOverrides: { 'inventory.uniq_branch_inventory_barcode': { COLUMN_NAME: 'barcode' } },
  })
  await assert.rejects(verifyFoundationSchema(wrong.db, migrationSource), /uniq_branch_inventory_barcode expected UNIQUE \(branch_id,barcode\)/)

  const stale = createFoundationSchemaFixture({
    legacyIndexes: [{ table: 'inventory', name: 'barcode', columns: ['barcode'] }],
  })
  await assert.rejects(verifyFoundationSchema(stale.db, migrationSource), /legacy unique indexes remain: inventory\.barcode/)
})

test('foundation verifier requires exact branch foreign keys and all seed invariants', async () => {
  const missingForeignKey = createFoundationSchemaFixture({ omitForeignKeys: ['branch_booking_settings.branch_id'] })
  await assert.rejects(verifyFoundationSchema(missingForeignKey.db, migrationSource), /branch_booking_settings\.branch_id -> clinic_branches\.id/)

  const wrongDeleteRule = createFoundationSchemaFixture()
  wrongDeleteRule.foreignKeyRows.find((row) => row.TABLE_NAME === 'admin_branch_permissions').DELETE_RULE = 'RESTRICT'
  await assert.rejects(verifyFoundationSchema(wrongDeleteRule.db, migrationSource), /admin_branch_permissions\.admin_id -> admins\.id ON DELETE CASCADE/)

  const missingBranchSeed = createFoundationSchemaFixture({ seeds: { branch: null } })
  await assert.rejects(verifyFoundationSchema(missingBranchSeed.db, migrationSource), /clinic_branches row id=1/)

  const missingBookingSeed = createFoundationSchemaFixture({ seeds: { bookingSettings: null } })
  await assert.rejects(verifyFoundationSchema(missingBookingSeed.db, migrationSource), /branch_booking_settings row branch_id=1/)

  const changedAdmin = createFoundationSchemaFixture({ seeds: { superAdmin: { id: 1, account_role: 'admin', branch_id: 1 } } })
  await assert.rejects(verifyFoundationSchema(changedAdmin.db, migrationSource), /admins\.id=1 must remain the unscoped superadmin/)
})

test('foundation verifier rejects missing branch assignments and orphaned branch references', async () => {
  const missingBranch = createFoundationSchemaFixture({ ownershipErrors: { 'appointments.branch_id': 2 } })
  await assert.rejects(verifyFoundationSchema(missingBranch.db, migrationSource), /appointments\.branch_id has 2 row\(s\) with a missing branch reference or NULL value/)

  const orphanedOptional = createFoundationSchemaFixture({ ownershipErrors: { 'admins.branch_id': 1 } })
  await assert.rejects(verifyFoundationSchema(orphanedOptional.db, migrationSource), /admins\.branch_id has 1 row\(s\) with a missing branch reference/)
})

test('partial rekey recovery creates the replacement before removing a legacy index', async () => {
  const fixture = createFoundationSchemaFixture({
    omitIndexes: ['inventory.uniq_branch_inventory_barcode'],
    legacyIndexes: [{ table: 'inventory', name: 'barcode', columns: ['barcode'] }],
  })
  await ensureFoundationRekeys(fixture.db, migrationSource)
  const alters = fixture.commands.filter((sql) => /^ALTER TABLE /i.test(sql))
  assert.deepEqual(alters, [
    'ALTER TABLE ' + String.fromCharCode(96) + 'inventory' + String.fromCharCode(96)
      + ' DROP INDEX ' + String.fromCharCode(96) + 'barcode' + String.fromCharCode(96)
      + ', ADD UNIQUE KEY ' + String.fromCharCode(96) + 'uniq_branch_inventory_barcode' + String.fromCharCode(96)
      + ' (' + ['branch_id', 'barcode'].map((column) => String.fromCharCode(96) + column + String.fromCharCode(96)).join(',') + ')',
  ])
  const result = await verifyFoundationSchema(fixture.db, migrationSource)
  assert.equal(result.indexes, 22)
})

test('partial rekey recovery refuses to drop a legacy key when its replacement is malformed', async () => {
  const fixture = createFoundationSchemaFixture({
    legacyIndexes: [{ table: 'inventory', name: 'barcode', columns: ['barcode'] }],
    indexOverrides: { 'inventory.uniq_branch_inventory_barcode': { COLUMN_NAME: 'barcode' } },
  })
  await assert.rejects(
    ensureFoundationRekeys(fixture.db, migrationSource),
    /Cannot safely recover foundation index inventory\.uniq_branch_inventory_barcode/,
  )
  assert.equal(fixture.commands.some((sql) => /^ALTER TABLE /i.test(sql)), false)
})

test('partial rekey recovery refuses to drop a legacy index with an unexpected definition', async () => {
  const fixture = createFoundationSchemaFixture({
    omitIndexes: ['inventory.uniq_branch_inventory_barcode'],
    legacyIndexes: [{ table: 'inventory', name: 'barcode', columns: ['name'] }],
  })
  await assert.rejects(
    ensureFoundationRekeys(fixture.db, migrationSource),
    /legacy foundation index inventory\.barcode: its existing unique definition does not match/,
  )
  assert.equal(fixture.commands.some((sql) => /^ALTER TABLE /i.test(sql)), false)
})



// Regression (UAT 2026-10-22): `npm run migrate` failed on the production-shaped
// database because admins.account_role ('superadmin') and admins.is_active were
// joined against clinic_branches.id as if they were branch references.
test('foundation verifier only checks *branch_id columns as branch references', async () => {
  const { isBranchReferenceColumn } = require('../../scripts/foundationSchema')
  assert.equal(isBranchReferenceColumn('branch_id'), true)
  assert.equal(isBranchReferenceColumn('source_branch_id'), true)
  assert.equal(isBranchReferenceColumn('account_role'), false)
  assert.equal(isBranchReferenceColumn('is_active'), false)
  // A real database returns a non-zero "orphan" count for these columns because
  // 'superadmin' / 0 never match a branch id. They must not fail verification.
  const fixture = createFoundationSchemaFixture({ ownershipErrors: { 'admins.account_role': 1, 'admins.is_active': 3 } })
  const result = await verifyFoundationSchema(fixture.db, migrationSource)
  assert.deepEqual(result.seeds, ['clinic_branches:1', 'branch_booking_settings:1', 'admins:1'])
  // Real branch references are still enforced.
  const orphan = createFoundationSchemaFixture({ ownershipErrors: { 'admins.account_role': 1, 'appointments.branch_id': 1 } })
  await assert.rejects(verifyFoundationSchema(orphan.db, migrationSource), /appointments\.branch_id has 1 row/)
})


