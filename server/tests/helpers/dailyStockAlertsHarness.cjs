const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const assert = require('node:assert/strict')
const date = require('../../utils/date'), profile = require('../../utils/patientProfile')
const source = fs.readFileSync(path.resolve(__dirname, '../../utils/dailyStockAlerts.js'), 'utf8')

function harness() {
  const state = {
    now: new Date('2026-11-12T12:00:00Z'),
    branches: [{ id: 1, name: 'Synthetic Laguna', is_active: 1 }, { id: 2, name: 'Synthetic Manila', is_active: 1 }, { id: 3, name: 'Inactive', is_active: 0 }],
    items: [{ id: 11, branch_id: 1, stock: 2, threshold: 5, batches: [{ quantity: 2, expiration_date: '2026-11-20' }] }, { id: 12, branch_id: 1, stock: 0, threshold: 5 }, { id: 21, branch_id: 2, stock: 20, threshold: 5 }],
    admins: [{ id: 9, account_role: 'superadmin', is_active: 1 }, { id: 1, account_role: 'admin', branch_id: 1, is_active: 1, inventory: true }, { id: 2, account_role: 'admin', branch_id: 2, is_active: 1, inventory: true }, { id: 3, account_role: 'admin', branch_id: 1, is_active: 1, inventory: false }, { id: 4, account_role: 'admin', branch_id: 1, is_active: 0, inventory: true }],
    staff: [{ id: 1, branch_id: 1, status: 'active', inventory: true }, { id: 2, branch_id: 2, status: 'active', inventory: true }, { id: 3, branch_id: 1, status: 'active', inventory: false }, { id: 4, branch_id: 1, status: 'inactive', inventory: true }],
    ledger: new Map(), notifications: [], calls: [], emissions: [], errors: [], failRecipient: null, missingLedger: false, nextId: 1, schedules: [], unscheduled: [],
  }
  const database = { query: async (sql, values = []) => {
    state.calls.push({ sql, values })
    if (sql.startsWith('SELECT * FROM notifications WHERE id=')) return [state.notifications.filter(row => row.id === Number(values[0]) && row.target_role === values[1] && (!row.target_user_id || row.target_user_id === Number(values[2])) && (!sql.includes(' AND branch_id=?') || row.branch_id === Number(values[3])))]
    if (sql.startsWith('SELECT id,is_active FROM clinic_branches')) return [state.branches.filter(row => row.id === Number(values[0]))]
    if (sql.startsWith('SELECT branch_id FROM inventory_daily_alert_deliveries')) {
      if (state.missingLedger) throw Object.assign(Error('Reviewed migration required'), { code: 'ER_NO_SUCH_TABLE' })
      return [[]]
    }
    if (sql.startsWith('SELECT id,name FROM clinic_branches')) return [state.branches.filter(row => row.is_active)]
    if (sql.startsWith('SELECT * FROM inventory')) {
      assert.match(sql, /branch_id=\? AND archived_at IS NULL/)
      return [state.items.filter(row => row.branch_id === values[0] && !row.archived_at)]
    }
    if (sql.includes('FROM admins a')) {
      assert.match(sql, /a\.branch_id=\?/); assert.match(sql, /s\.branch_id=\?/)
      assert.match(sql, /a\.is_active=1/); assert.match(sql, /s\.status='active'/)
      assert.match(sql, /admin_branch_permissions/); assert.match(sql, /staff_permissions/)
      assert.equal((sql.match(/p\.permission_key='inventory' AND p\.granted=1/g) || []).length, 2)
      assert.equal(values[0], values[1])
      return [[...state.admins.filter(row => row.is_active && (row.account_role === 'superadmin' || (row.branch_id === values[0] && row.inventory))).map(row => ({ target_role: 'admin', target_user_id: row.id, account_role: row.account_role })),
        ...state.staff.filter(row => row.branch_id === values[1] && row.status === 'active' && row.inventory).map(row => ({ target_role: 'staff', target_user_id: row.id, account_role: 'staff' }))]]
    }
    throw Error('Unexpected daily alert read: ' + sql)
  }, getConnection: async () => {
    const owned = [], pending = []; let committed = false
    const connection = { beginTransaction: async () => {}, release() {},
      rollback: async () => { if (!committed) for (const key of owned) state.ledger.delete(key) },
      commit: async () => { state.notifications.push(...pending); committed = true },
      query: async (sql, values) => {
        state.calls.push({ sql, values })
        if (sql.startsWith('INSERT IGNORE INTO inventory_daily_alert_deliveries')) {
          const key = values.join('|')
          if (state.ledger.has(key)) return [{ affectedRows: 0 }]
          state.ledger.set(key, { notification_id: null }); owned.push(key)
          return [{ affectedRows: 1 }]
        }
        if (sql.startsWith('INSERT INTO notifications')) {
          if (`${values[0]}:${values[1]}` === state.failRecipient) throw Error('Synthetic notification insert failure')
          const columns = ['target_role','target_user_id','type','title','message','reference_type','reference_id','body','link','branch_id']
          const notification = Object.fromEntries(columns.map((key, index) => [key, values[index]]))
          notification.id = state.nextId++; pending.push(notification)
          return [{ insertId: notification.id }]
        }
        if (sql.startsWith('UPDATE inventory_daily_alert_deliveries')) {
          const key = values.slice(1).join('|'); assert.ok(owned.includes(key))
          state.ledger.get(key).notification_id = values[0]
          return [{ affectedRows: 1 }]
        }
        throw Error('Unexpected daily alert write: ' + sql)
      },
    }
    return connection
  } }
  const module = { exports: {} }
  const dependencies = { '../db/connect': database, './inventoryBatches': { attachBatchesToInventory: async rows => rows }, './date': date, './allInventoryOverview': require('../../utils/allInventoryOverview'), './sse': { broadcast() {} }, './patientProfile': profile }
  vm.runInNewContext(source, { module, Date, console, setInterval, clearInterval, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name] } })
  const create = () => module.exports.createDailyStockAlertWorker({ database, clock: () => state.now,
    hydrate: async (items, executor) => { assert.equal(executor, database); return items },
    emit: (...args) => { assert.ok(state.notifications.some(row => row.id === args[2].id), 'Broadcast only committed notifications'); state.emissions.push(args) },
    logger: { error: (...args) => state.errors.push(args) },
    schedule: (fn, delay) => { const timer = { fn, delay, unref() {} }; state.schedules.push(timer); return timer },
    unschedule: timer => state.unscheduled.push(timer),
  })
  const destinationModule = { exports: {} }
  const destinationDeps = { '../db/connect': database, './date': date, './staffPermissions': { loadStaffPermissions: async id => state.staff.find(row => row.id === Number(id))?.inventory ? ['inventory'] : [] } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../utils/notificationDestination.js'), 'utf8'), { module: destinationModule, Date, require: name => destinationDeps[name] })
  return { state, database, create, summarize: module.exports.summarizeStockAlerts, destination: options => destinationModule.exports.notificationDestination(options, database) }
}
module.exports = { harness }
