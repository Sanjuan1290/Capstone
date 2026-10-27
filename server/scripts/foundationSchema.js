'use strict'

const identifier = (value) => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(String(value))) throw new Error('Unsafe schema identifier.')
  return String.fromCharCode(96) + value + String.fromCharCode(96)
}

const parseDefinition = (definition) => {
  const match = /^\s*([A-Za-z]+)(?:\(([^)]+)\))?/i.exec(definition)
  if (!match) throw new Error('Unrecognized foundation column definition: ' + definition)
  const dataType = match[1].toLowerCase()
  const parameters = match[2] ? match[2].split(',').map((value) => Number(value.trim())) : []
  const defaultMatch = /\bDEFAULT\s+('(?:''|[^'])*'|"(?:""|[^"])*"|[^\s]+)/i.exec(definition)
  let defaultValue
  if (defaultMatch) {
    defaultValue = defaultMatch[1]
    if ((defaultValue.startsWith("'") && defaultValue.endsWith("'"))
      || (defaultValue.startsWith('"') && defaultValue.endsWith('"'))) {
      defaultValue = defaultValue.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"')
    }
  }
  return {
    dataType,
    ...(dataType === 'varchar' && parameters.length ? { length: parameters[0] } : {}),
    ...(dataType === 'decimal' && parameters.length
      ? { precision: parameters[0], scale: parameters[1] || 0 }
      : {}),
    nullable: /\bNOT\s+NULL\b/i.test(definition) ? false : (/\bNULL\b/i.test(definition) ? true : null),
    ...(defaultMatch ? { defaultValue } : {}),
    autoIncrement: /\bAUTO_INCREMENT\b/i.test(definition),
    onUpdateCurrentTimestamp: /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i.test(definition),
  }
}

function foundationColumnDefinitions(source) {
  const columns = []
  const pattern = /CALL\s+carait_branch_column\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:"([^"]*)"|'((?:''|[^'])*)')\s*\)/gi
  for (const match of source.matchAll(pattern)) {
    columns.push({
      table: match[1],
      column: match[2],
      definition: (match[3] !== undefined ? match[3] : match[4].replace(/''/g, "'")).trim(),
    })
  }
  if (columns.length < 20) throw new Error('Foundation migration ownership catalog is unexpectedly incomplete')
  return columns
}

const isBranchReferenceColumn = (column) => /(^|_)branch_id$/.test(String(column || ''))

function requiredFoundationColumns(source) {
  return foundationColumnDefinitions(source).map((item) => [item.table, item.column])
}

function indexCalls(source) {
  const indexes = []
  const standardPattern = /CALL\s+carait_branch_index\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'CREATE\s+INDEX\s+[^']+?\s+ON\s+[^']+?\s*\(([^)]+)\)'\s*\)/gi
  for (const match of source.matchAll(standardPattern)) {
    indexes.push({ table: match[1], name: match[2], columns: match[3].split(',').map((value) => value.trim()), unique: false })
  }
  const rekeys = []
  const rekeyPattern = /CALL\s+carait_branch_rekey\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/gi
  for (const match of source.matchAll(rekeyPattern)) {
    const item = {
      table: match[1],
      oldName: match[2],
      name: match[3],
      columns: match[4].split(',').map((value) => value.trim()),
      unique: true,
    }
    rekeys.push(item)
    indexes.push({ table: item.table, name: item.name, columns: item.columns, unique: true })
  }
  if (indexes.length < 15 || rekeys.length < 8) throw new Error('Foundation migration index catalog is unexpectedly incomplete')
  return { indexes, rekeys }
}

const c = (dataType, options = {}) => ({ dataType, nullable: null, ...options })
const foundationTableColumns = {
  clinic_branches: {
    id: c('int', { nullable: false, autoIncrement: true }),
    code: c('varchar', { length: 32, nullable: false }),
    name: c('varchar', { length: 180, nullable: false }),
    address: c('varchar', { length: 255, nullable: true }),
    phone: c('varchar', { length: 80, nullable: true }),
    email: c('varchar', { length: 160, nullable: true }),
    offers_medical: c('tinyint', { nullable: false, defaultValue: '1' }),
    offers_derma: c('tinyint', { nullable: false, defaultValue: '1' }),
    is_active: c('tinyint', { nullable: false, defaultValue: '1' }),
    created_at: c('timestamp', { nullable: false, currentTimestamp: true }),
    updated_at: c('timestamp', { nullable: false, currentTimestamp: true, onUpdateCurrentTimestamp: true }),
  },
  admin_branch_permissions: {
    admin_id: c('int', { nullable: false }),
    permission_key: c('varchar', { length: 48, nullable: false }),
    granted: c('tinyint', { nullable: false, defaultValue: '1' }),
  },
  branch_booking_settings: {
    branch_id: c('int', { nullable: false }),
    online_min_lead_minutes: c('int', { nullable: false, defaultValue: '720' }),
    pending_confirmation_cutoff_minutes: c('int', { nullable: false, defaultValue: '60' }),
    booking_start_interval_minutes: c('int', { nullable: false, defaultValue: '30' }),
    no_show_grace_minutes: c('int', { nullable: false, defaultValue: '15' }),
    updated_by_admin_id: c('int', { nullable: true }),
    updated_at: c('timestamp', { currentTimestamp: true, onUpdateCurrentTimestamp: true }),
  },
  branch_stock_transfer_requests: {
    id: c('bigint', { nullable: false, autoIncrement: true }),
    from_branch_id: c('int', { nullable: false }),
    to_branch_id: c('int', { nullable: false }),
    requested_by_admin_id: c('int', { nullable: false }),
    inventory_id: c('int', { nullable: false }),
    batch_id: c('int', { nullable: true }),
    quantity: c('decimal', { precision: 12, scale: 4, nullable: false }),
    status: c('enum', { nullable: false, defaultValue: 'requested', enumValues: ['requested', 'approved', 'dispatched', 'received', 'cancelled'] }),
    approved_by_admin_id: c('int', { nullable: true }),
    received_by_admin_id: c('int', { nullable: true }),
    created_at: c('timestamp', { currentTimestamp: true }),
    updated_at: c('timestamp', { currentTimestamp: true, onUpdateCurrentTimestamp: true }),
  },
}

const foundationIndexes = [
  { table: 'clinic_branches', name: 'PRIMARY', columns: ['id'], unique: true },
  { table: 'clinic_branches', name: 'uniq_branch_code', columns: ['code'], unique: true },
  { table: 'admin_branch_permissions', name: 'PRIMARY', columns: ['admin_id', 'permission_key'], unique: true },
  { table: 'branch_booking_settings', name: 'PRIMARY', columns: ['branch_id'], unique: true },
  { table: 'branch_stock_transfer_requests', name: 'PRIMARY', columns: ['id'], unique: true },
]

const foundationForeignKeys = [
  { table: 'admin_branch_permissions', column: 'admin_id', refTable: 'admins', refColumn: 'id', deleteRules: ['CASCADE'] },
  { table: 'branch_booking_settings', column: 'branch_id', refTable: 'clinic_branches', refColumn: 'id', deleteRules: ['RESTRICT', 'NO ACTION'] },
  { table: 'branch_stock_transfer_requests', column: 'from_branch_id', refTable: 'clinic_branches', refColumn: 'id', deleteRules: ['RESTRICT', 'NO ACTION'] },
  { table: 'branch_stock_transfer_requests', column: 'to_branch_id', refTable: 'clinic_branches', refColumn: 'id', deleteRules: ['RESTRICT', 'NO ACTION'] },
  { table: 'branch_stock_transfer_requests', column: 'inventory_id', refTable: 'inventory', refColumn: 'id', deleteRules: ['RESTRICT', 'NO ACTION'] },
]

const legacyRekeyColumns = {
  'billing_service_catalog.uniq_billing_service_name': ['service_name', 'clinic_type'],
  'billing_service_categories.uniq_billing_service_category': ['clinic_type', 'name'],
  'appointment_cancellation_reasons.uniq_appointment_cancellation_reason_label': ['label'],
  'appointment_reason_options.uniq_appointment_reason_label': ['label', 'clinic_type'],
  'inventory_locations.uniq_inventory_location_name': ['name'],
  'inventory.barcode': ['barcode'],
  'inventory_location_types.uniq_inventory_location_type_name': ['name'],
  'inventory_location_types.uniq_inventory_location_type_code': ['code'],
}

const field = (row, name) => {
  const key = Object.keys(row || {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  return key === undefined ? undefined : row[key]
}
const listPlaceholders = (values) => values.map(() => '?').join(',')
const normalizeCurrentTimestamp = (value) => String(value ?? '').trim().replace(/\(\d*\)$/, '').toLowerCase() === 'current_timestamp'

function foundationContract(source) {
  const ownershipColumns = foundationColumnDefinitions(source)
  const calls = indexCalls(source)
  const columns = Object.fromEntries(Object.entries(foundationTableColumns).map(([table, specs]) => [table, { ...specs }]))
  for (const item of ownershipColumns) {
    if (!columns[item.table]) columns[item.table] = {}
    columns[item.table][item.column] = parseDefinition(item.definition)
  }
  const indexes = [...foundationIndexes, ...calls.indexes]
  const tables = [...new Set([...Object.keys(columns), ...ownershipColumns.map((item) => item.table)])]
  return { tables, columns, indexes, rekeys: calls.rekeys, foreignKeys: foundationForeignKeys, ownershipColumns }
}

function columnMismatch(expected, row) {
  if (!row) return 'missing'
  const actualType = String(field(row, 'DATA_TYPE') || '').toLowerCase()
  if (actualType !== expected.dataType) return 'type ' + (actualType || 'unknown') + ' (expected ' + expected.dataType + ')'
  const actualLength = field(row, 'CHARACTER_MAXIMUM_LENGTH')
  if (expected.length !== undefined && Number(actualLength) !== expected.length) return 'length ' + actualLength + ' (expected ' + expected.length + ')'
  const actualPrecision = field(row, 'NUMERIC_PRECISION')
  const actualScale = field(row, 'NUMERIC_SCALE')
  if (expected.precision !== undefined
    && (Number(actualPrecision) !== expected.precision || Number(actualScale) !== expected.scale)) {
    return 'precision ' + actualPrecision + ',' + actualScale + ' (expected ' + expected.precision + ',' + expected.scale + ')'
  }
  if (expected.nullable !== null && expected.nullable !== undefined) {
    const actualNullable = String(field(row, 'IS_NULLABLE') || '').toUpperCase() === 'YES'
    if (actualNullable !== expected.nullable) return 'nullability ' + (actualNullable ? 'NULL' : 'NOT NULL')
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'defaultValue')) {
    const actual = field(row, 'COLUMN_DEFAULT')
    const defaultMatches = expected.defaultValue === 'CURRENT_TIMESTAMP'
      ? normalizeCurrentTimestamp(actual)
      : String(actual ?? '') === String(expected.defaultValue)
    if (!defaultMatches) return 'default ' + String(actual ?? 'NULL') + ' (expected ' + expected.defaultValue + ')'
  } else if (expected.currentTimestamp && !normalizeCurrentTimestamp(field(row, 'COLUMN_DEFAULT'))) {
    return 'default is not CURRENT_TIMESTAMP'
  }
  const extra = String(field(row, 'EXTRA') || '').toLowerCase()
  if (expected.autoIncrement && !extra.includes('auto_increment')) return 'AUTO_INCREMENT is missing'
  if (expected.onUpdateCurrentTimestamp && !extra.includes('on update current_timestamp')) return 'ON UPDATE CURRENT_TIMESTAMP is missing'
  if (expected.enumValues) {
    const actualColumnType = String(field(row, 'COLUMN_TYPE') || '').toLowerCase()
    const expectedColumnType = 'enum(' + expected.enumValues.map((value) => "'" + value + "'").join(',') + ')'
    if (actualColumnType !== expectedColumnType) return 'enum values do not match the migration'
  }
  return null
}

function groupIndexes(rows) {
  const indexes = new Map()
  for (const row of rows) {
    const table = field(row, 'TABLE_NAME')
    const name = field(row, 'INDEX_NAME')
    const key = table + '.' + name
    if (!indexes.has(key)) indexes.set(key, { table, name, unique: Number(field(row, 'NON_UNIQUE')) === 0, columns: [] })
    indexes.get(key).columns[Number(field(row, 'SEQ_IN_INDEX')) - 1] = String(field(row, 'COLUMN_NAME'))
  }
  return indexes
}

const indexMatches = (actual, expected) => Boolean(actual
  && actual.unique === expected.unique
  && actual.columns.length === expected.columns.length
  && actual.columns.every((column, position) => column === expected.columns[position]))

async function readIndexRows(db, tables) {
  const [rows] = await db.query(
    'SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (' + listPlaceholders(tables) + ')',
    tables,
  )
  return rows
}

async function ensureFoundationRekeys(db, source) {
  const contract = foundationContract(source)
  const tables = [...new Set(contract.rekeys.map((item) => item.table))]
  const indexes = groupIndexes(await readIndexRows(db, tables))
  const [tableRows] = await db.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (' + listPlaceholders(tables) + ')',
    tables,
  )
  const existingTables = new Set(tableRows.map((row) => String(field(row, 'TABLE_NAME') || '')))
  for (const item of contract.rekeys) {
    if (!existingTables.has(item.table)) continue
    const replacement = indexes.get(item.table + '.' + item.name)
    const old = indexes.get(item.table + '.' + item.oldName)
    const expected = { table: item.table, name: item.name, columns: item.columns, unique: true }
    const oldColumns = legacyRekeyColumns[item.table + '.' + item.oldName]
    if (old && (!oldColumns || !indexMatches(old, {
      table: item.table,
      name: item.oldName,
      columns: oldColumns,
      unique: true,
    }))) {
      throw new Error('Cannot safely remove legacy foundation index ' + item.table + '.' + item.oldName + ': its existing unique definition does not match the expected columns.')
    }
    if (replacement && !indexMatches(replacement, expected)) {
      throw new Error('Cannot safely recover foundation index ' + item.table + '.' + item.name + ': its existing definition does not match UNIQUE (' + item.columns.join(',') + ').')
    }
    if (!replacement) {
      const oldClause = old ? 'DROP INDEX ' + identifier(item.oldName) + ', ' : ''
      await db.query(
        'ALTER TABLE ' + identifier(item.table) + ' ' + oldClause + 'ADD UNIQUE KEY ' + identifier(item.name) + ' (' + item.columns.map(identifier).join(',') + ')',
      )
      indexes.delete(item.table + '.' + item.oldName)
      indexes.set(item.table + '.' + item.name, expected)
    } else if (old) {
      // Remove the broader legacy unique key only after the branch-scoped
      // replacement is present with the exact required columns.
      await db.query('ALTER TABLE ' + identifier(item.table) + ' DROP INDEX ' + identifier(item.oldName))
      indexes.delete(item.table + '.' + item.oldName)
    }
  }
}

async function verifyFoundationSchema(db, source) {
  const contract = foundationContract(source)
  const placeholders = listPlaceholders(contract.tables)
  const [tableRows] = await db.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (' + placeholders + ')',
    contract.tables,
  )
  const existingTables = new Set(tableRows.map((row) => String(field(row, 'TABLE_NAME') || '')))
  const missingTables = contract.tables.filter((table) => !existingTables.has(table))
  if (missingTables.length) throw new Error('Partial foundation schema: missing tables ' + missingTables.join(', '))

  const [columnRows] = await db.query(
    'SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,CHARACTER_MAXIMUM_LENGTH,NUMERIC_PRECISION,NUMERIC_SCALE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (' + placeholders + ')',
    contract.tables,
  )
  const columnMap = new Map(columnRows.map((row) => [
    String(field(row, 'TABLE_NAME')) + '.' + String(field(row, 'COLUMN_NAME')),
    row,
  ]))
  const missingColumns = []
  for (const [table, columns] of Object.entries(contract.columns)) {
    for (const [column, expected] of Object.entries(columns)) {
      const mismatch = columnMismatch(expected, columnMap.get(table + '.' + column))
      if (mismatch) missingColumns.push(table + '.' + column + ' (' + mismatch + ')')
    }
  }

  const indexRows = await readIndexRows(db, contract.tables)
  const indexes = groupIndexes(indexRows)
  const missingIndexes = contract.indexes.filter((expected) => !indexMatches(indexes.get(expected.table + '.' + expected.name), expected))
  const staleIndexes = contract.rekeys
    .filter((expected) => indexes.has(expected.table + '.' + expected.oldName))
    .map((expected) => expected.table + '.' + expected.oldName)

  const [foreignKeyRows] = await db.query(
    'SELECT k.TABLE_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME IN (' + placeholders + ') AND k.REFERENCED_TABLE_NAME IS NOT NULL',
    contract.tables,
  )
  const foreignKeyPresent = (expected) => foreignKeyRows.some((row) =>
    String(field(row, 'TABLE_NAME')) === expected.table
    && String(field(row, 'COLUMN_NAME')) === expected.column
    && String(field(row, 'REFERENCED_TABLE_NAME')) === expected.refTable
    && String(field(row, 'REFERENCED_COLUMN_NAME')) === expected.refColumn
    && expected.deleteRules.includes(String(field(row, 'DELETE_RULE') || '').toUpperCase()))
  const missingForeignKeys = contract.foreignKeys.filter((expected) => !foreignKeyPresent(expected))
    .map((item) => item.table + '.' + item.column + ' -> ' + item.refTable + '.' + item.refColumn + ' ON DELETE ' + item.deleteRules.join('/'))

  const problems = []
  if (missingColumns.length) problems.push('missing or incompatible columns: ' + missingColumns.join(', '))
  if (missingIndexes.length) {
    problems.push('missing or incompatible indexes: ' + missingIndexes.map((item) =>
      item.table + '.' + item.name + ' expected ' + (item.unique ? 'UNIQUE ' : '') + '(' + item.columns.join(',') + ')',
    ).join(', '))
  }
  if (staleIndexes.length) problems.push('legacy unique indexes remain: ' + staleIndexes.join(', '))
  if (missingForeignKeys.length) problems.push('missing or incompatible foreign keys: ' + missingForeignKeys.join(', '))
  if (problems.length) throw new Error('Partial foundation schema: ' + problems.join('; '))

  const [[branch]] = await db.query('SELECT id,code,name FROM clinic_branches WHERE id=1')
  if (!branch || !String(branch.code || '').trim() || !String(branch.name || '').trim()) {
    throw new Error('Missing foundation seed: clinic_branches row id=1 must have a non-empty code and name.')
  }
  const [[bookingSettings]] = await db.query('SELECT branch_id FROM branch_booking_settings WHERE branch_id=1')
  if (!bookingSettings) throw new Error('Missing foundation seed: branch_booking_settings row branch_id=1.')
  const [[superAdmin]] = await db.query('SELECT id,account_role,branch_id FROM admins WHERE id=1')
  if (!superAdmin || String(superAdmin.account_role || '').toLowerCase() !== 'superadmin' || superAdmin.branch_id !== null) {
    throw new Error('Missing foundation invariant: admins.id=1 must remain the unscoped superadmin account.')
  }

  const ownershipDataErrors = []
  const optionalBranchColumns = new Set(['admins.branch_id', 'audit_logs.branch_id'])
  for (const item of contract.ownershipColumns) {
    const key = item.table + '.' + item.column
    // carait_branch_column() also adds non-reference columns (admins.account_role,
    // admins.is_active). Only *branch_id columns reference clinic_branches.id.
    if (!isBranchReferenceColumn(item.column)) continue
    if (!columnMap.has(key)) continue
    const nullable = optionalBranchColumns.has(key)
    const nullPredicate = nullable ? '' : ' OR t.' + identifier(item.column) + ' IS NULL'
    const [[invalid]] = await db.query(
      'SELECT COUNT(*) AS n FROM ' + identifier(item.table) + ' t LEFT JOIN clinic_branches b ON b.id=t.' + identifier(item.column)
        + ' WHERE (t.' + identifier(item.column) + ' IS NOT NULL AND b.id IS NULL)' + nullPredicate,
    )
    const count = Number(field(invalid || {}, 'n') || 0)
    if (count) ownershipDataErrors.push(item.table + '.' + item.column + ' has ' + count + ' row(s) with a missing branch reference' + (nullable ? '' : ' or NULL value'))
  }
  if (ownershipDataErrors.length) throw new Error('Partial foundation data: ' + ownershipDataErrors.join(', '))

  return {
    tables: contract.tables.length,
    columns: Object.values(contract.columns).reduce((sum, columns) => sum + Object.keys(columns).length, 0),
    indexes: contract.indexes.length,
    foreignKeys: contract.foreignKeys.length,
    ownershipColumns: contract.ownershipColumns.length,
    seeds: ['clinic_branches:1', 'branch_booking_settings:1', 'admins:1'],
  }
}

module.exports = { foundationContract, isBranchReferenceColumn, requiredFoundationColumns, ensureFoundationRekeys, verifyFoundationSchema, groupIndexes, indexMatches }


