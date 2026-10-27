'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { foundationContract } = require('../../scripts/foundationSchema')

const migrationPath = path.resolve(__dirname, '../../db/migrations/2026-10-09-multi-branch-foundation.sql')
const migrationSource = fs.readFileSync(migrationPath, 'utf8')
const contract = foundationContract(migrationSource)

const columnType = (expected) => {
  if (expected.enumValues) return 'enum(' + expected.enumValues.map((value) => "'" + value + "'").join(',') + ')'
  if (expected.length !== undefined) return expected.dataType + '(' + expected.length + ')'
  if (expected.precision !== undefined) return expected.dataType + '(' + expected.precision + ',' + expected.scale + ')'
  if (expected.dataType === 'tinyint') return 'tinyint(1)'
  return expected.dataType
}

function createFoundationSchemaFixture(options = {}) {
  const removed = (value, list) => (list || []).includes(value)
  const tableRows = contract.tables
    .filter((table) => !removed(table, options.omitTables))
    .map((TABLE_NAME) => ({ TABLE_NAME }))
  const columnRows = []
  for (const [TABLE_NAME, columns] of Object.entries(contract.columns)) {
    for (const [COLUMN_NAME, expected] of Object.entries(columns)) {
      const key = TABLE_NAME + '.' + COLUMN_NAME
      if (removed(key, options.omitColumns)) continue
      const override = (options.columnOverrides || {})[key] || {}
      columnRows.push({
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE: expected.dataType,
        COLUMN_TYPE: columnType(expected),
        CHARACTER_MAXIMUM_LENGTH: expected.length ?? null,
        NUMERIC_PRECISION: expected.precision ?? null,
        NUMERIC_SCALE: expected.scale ?? null,
        IS_NULLABLE: expected.nullable === null || expected.nullable === undefined
          ? 'YES'
          : (expected.nullable ? 'YES' : 'NO'),
        COLUMN_DEFAULT: Object.prototype.hasOwnProperty.call(expected, 'defaultValue')
          ? expected.defaultValue
          : (expected.currentTimestamp ? 'CURRENT_TIMESTAMP' : null),
        EXTRA: [
          expected.autoIncrement ? 'auto_increment' : '',
          expected.onUpdateCurrentTimestamp ? 'on update CURRENT_TIMESTAMP' : '',
        ].filter(Boolean).join(' '),
        ...override,
      })
    }
  }
  const indexRows = []
  for (const index of contract.indexes) {
    if (removed(index.table + '.' + index.name, options.omitIndexes)) continue
    const override = (options.indexOverrides || {})[index.table + '.' + index.name] || {}
    index.columns.forEach((COLUMN_NAME, position) => indexRows.push({
      TABLE_NAME: index.table,
      INDEX_NAME: index.name,
      NON_UNIQUE: index.unique ? 0 : 1,
      SEQ_IN_INDEX: position + 1,
      COLUMN_NAME,
      ...override,
    }))
  }
  for (const index of options.legacyIndexes || []) {
    index.columns.forEach((COLUMN_NAME, position) => indexRows.push({
      TABLE_NAME: index.table,
      INDEX_NAME: index.name,
      NON_UNIQUE: 0,
      SEQ_IN_INDEX: position + 1,
      COLUMN_NAME,
    }))
  }
  const foreignKeyRows = contract.foreignKeys
    .filter((foreignKey) => !removed(foreignKey.table + '.' + foreignKey.column, options.omitForeignKeys))
    .map((foreignKey) => ({
      TABLE_NAME: foreignKey.table,
      COLUMN_NAME: foreignKey.column,
      REFERENCED_TABLE_NAME: foreignKey.refTable,
      REFERENCED_COLUMN_NAME: foreignKey.refColumn,
      DELETE_RULE: foreignKey.deleteRules[0],
    }))
  const commands = []
  const seeds = {
    branch: { id: 1, code: 'EXISTING', name: 'Existing Clinic Branch' },
    bookingSettings: { branch_id: 1 },
    superAdmin: { id: 1, account_role: 'superadmin', branch_id: null },
    ...options.seeds,
  }

  const rowsResult = (rows) => [rows, []]
  const db = {
    async query(sql, params = []) {
      const text = String(sql)
      commands.push(text)
      if (/information_schema\.TABLES/i.test(text)) {
        return rowsResult(tableRows.filter((row) => params.includes(row.TABLE_NAME)))
      }
      if (/information_schema\.COLUMNS/i.test(text)) {
        return rowsResult(columnRows.filter((row) => params.includes(row.TABLE_NAME)))
      }
      if (/information_schema\.STATISTICS/i.test(text)) {
        return rowsResult(indexRows.filter((row) => params.includes(row.TABLE_NAME)))
      }
      if (/information_schema\.KEY_COLUMN_USAGE/i.test(text)) {
        return rowsResult(foreignKeyRows.filter((row) => params.includes(row.TABLE_NAME)))
      }
      if (/^SELECT id,code,name FROM clinic_branches/i.test(text)) return rowsResult(seeds.branch ? [seeds.branch] : [])
      if (/^SELECT branch_id FROM branch_booking_settings/i.test(text)) return rowsResult(seeds.bookingSettings ? [seeds.bookingSettings] : [])
      if (/^SELECT id,account_role,branch_id FROM admins/i.test(text)) return rowsResult(seeds.superAdmin ? [seeds.superAdmin] : [])
      if (/^SELECT COUNT\(\*\) AS n FROM /i.test(text)) {
        const table = /FROM\s+[\x60]([^\x60]+)[\x60]\s+t/i.exec(text)?.[1]
        const column = /t\.[\x60]([^\x60]+)[\x60]/i.exec(text)?.[1]
        const count = Number((options.ownershipErrors || {})[(table || '') + '.' + (column || '')] || 0)
        return rowsResult([{ n: count }])
      }
      if (/^ALTER TABLE /i.test(text)) {
        const table = /^ALTER TABLE\s+[\x60]?([A-Za-z_][A-Za-z_0-9]*)/i.exec(text)?.[1]
        for (const match of text.matchAll(/DROP INDEX\s+[\x60]?([A-Za-z_][A-Za-z_0-9]*)/gi)) {
          for (let index = indexRows.length - 1; index >= 0; index--) {
            if (indexRows[index].TABLE_NAME === table && indexRows[index].INDEX_NAME === match[1]) indexRows.splice(index, 1)
          }
        }
        const add = /ADD UNIQUE KEY\s+[\x60]?([A-Za-z_][A-Za-z_0-9]*)[\x60]?\s*\(([^)]+)\)/i.exec(text)
        if (add) {
          const columns = add[2].split(',').map((value) => value.replace(/[\x60\s]/g, ''))
          columns.forEach((COLUMN_NAME, position) => indexRows.push({
            TABLE_NAME: table,
            INDEX_NAME: add[1],
            NON_UNIQUE: 0,
            SEQ_IN_INDEX: position + 1,
            COLUMN_NAME,
          }))
        }
        return rowsResult([{ affectedRows: 1 }])
      }
      return rowsResult([])
    },
  }
  return { db, commands, contract, tableRows, columnRows, indexRows, foreignKeyRows }
}

module.exports = { createFoundationSchemaFixture, migrationSource, contract }


