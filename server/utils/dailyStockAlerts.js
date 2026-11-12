'use strict'

const db = require('../db/connect')
const { attachBatchesToInventory } = require('./inventoryBatches')
const { getTodayDateOnly, addDaysDateOnly } = require('./date')
const { dateOnly } = require('./allInventoryOverview')
const { broadcast } = require('./sse')
const { isValidDateOnly } = require('./patientProfile')

// Count branch items, checking every available batch so an expired batch cannot
// hide another that expires soon. Match Inventory's available whole-unit stock.
function summarizeStockAlerts(items, today) {
  const cutoff = addDaysDateOnly(today, 30)
  const summary = { low_stock: 0, out_of_stock: 0, expiring_30_days: 0, expired: 0, items_with_alerts: 0 }
  for (const item of items) {
    if (item.archived_at) continue
    const unitSize = Number(item.unit_size) || 1
    const stock = Math.floor(item.available_stock != null ? Number(item.available_stock) : Number(item.stock_base ?? Number(item.stock || 0) * unitSize) / unitSize)
    const low = stock > 0 && stock <= Number(item.threshold || 0)
    const out = stock <= 0
    const dates = Array.isArray(item.batches) && item.batches.length
      ? item.batches.filter(batch => !batch.archived_at && Number(batch.available_quantity ?? batch.quantity) > 0).map(batch => dateOnly(batch.expiration_date)).filter(Boolean)
      : stock > 0 ? [dateOnly(item.expiration_date)].filter(Boolean) : []
    const expired = dates.some(date => isValidDateOnly(date) && date < today)
    const expiring = dates.some(date => isValidDateOnly(date) && date >= today && date <= cutoff)
    summary.low_stock += Number(low)
    summary.out_of_stock += Number(out)
    summary.expired += Number(expired)
    summary.expiring_30_days += Number(expiring)
    summary.items_with_alerts += Number(low || out || expired || expiring)
  }
  return summary
}

const recipientsSql = `SELECT 'admin' AS target_role,a.id AS target_user_id,a.account_role
  FROM admins a WHERE a.is_active=1 AND (
    a.account_role='superadmin' OR (a.account_role='admin' AND a.branch_id=? AND EXISTS (
      SELECT 1 FROM admin_branch_permissions p WHERE p.admin_id=a.id AND p.permission_key='inventory' AND p.granted=1)))
  UNION ALL
  SELECT 'staff' AS target_role,s.id AS target_user_id,'staff' AS account_role
  FROM staff s WHERE s.branch_id=? AND s.status='active' AND EXISTS (
    SELECT 1 FROM staff_permissions p WHERE p.staff_id=s.id AND p.permission_key='inventory' AND p.granted=1)`

function createDailyStockAlertWorker({ database = db, hydrate = attachBatchesToInventory, emit = broadcast, clock = () => new Date(), logger = console, schedule = setInterval, unschedule = clearInterval } = {}) {
  let running = false, timer = null
  const deliver = async (branch, recipient, today, summary) => {
    const connection = await database.getConnection()
    let notification
    try {
      await connection.beginTransaction()
      const [reserved] = await connection.query(`INSERT IGNORE INTO inventory_daily_alert_deliveries
        (branch_id,alert_date,target_role,target_user_id) VALUES (?,?,?,?)`,
      [branch.id,today,recipient.target_role,recipient.target_user_id])
      if (!reserved.affectedRows) { await connection.rollback(); return false }
      const counts = [['low_stock','low stock'],['out_of_stock','out of stock'],['expiring_30_days','expiring within 30 days'],['expired','expired']]
        .filter(([key]) => summary[key] > 0).map(([key,label]) => `${summary[key]} ${label}`).join('; ')
      const base = recipient.account_role === 'superadmin' ? `/superadmin/branches/${branch.id}` : `/${recipient.target_role}`
      notification = { target_role: recipient.target_role, target_user_id: recipient.target_user_id, type: 'stock_daily_alert',
        title: `Daily stock alerts - ${branch.name}`, message: `${counts}. Review Inventory.`,
        reference_type: 'inventory_alert', reference_id: branch.id, body: null, link: `${base}/inventory`, branch_id: branch.id }
      const [created] = await connection.query(`INSERT INTO notifications
        (target_role,target_user_id,type,title,message,reference_type,reference_id,body,link,branch_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [notification.target_role,notification.target_user_id,notification.type,notification.title,notification.message,notification.reference_type,notification.reference_id,notification.body,notification.link,notification.branch_id])
      notification.id = created.insertId
      await connection.query(`UPDATE inventory_daily_alert_deliveries SET notification_id=?
        WHERE branch_id=? AND alert_date=? AND target_role=? AND target_user_id=?`,
      [notification.id,branch.id,today,recipient.target_role,recipient.target_user_id])
      await connection.commit()
    } catch (error) { await connection.rollback().catch(() => {}); throw error }
    finally { connection.release() }
    // Persist before broadcasting. A missed live event is recovered by the bell's
    // polling; delivery stays recorded across worker restarts and parallel servers.
    try {
      const audience = recipient.account_role === 'superadmin' ? `superadmin_${recipient.target_user_id}` : `${recipient.target_role}_${recipient.target_user_id}`
      emit([audience], 'notification_created', notification, { branchId: branch.id })
    } catch (error) { logger.error('[daily-stock-alerts] live update failed:', error.message) }
    return true
  }

  const run = async () => {
    if (running) return { skipped: true }
    running = true
    let delivered = 0, failed = 0
    try {
      const today = getTodayDateOnly(clock())
      const [branches] = await database.query('SELECT id,name FROM clinic_branches WHERE is_active=1 ORDER BY id')
      for (const branch of branches) {
        try {
          const [items] = await database.query('SELECT * FROM inventory WHERE branch_id=? AND archived_at IS NULL ORDER BY id', [branch.id])
          const summary = summarizeStockAlerts(await hydrate(items, database), today)
          if (!summary.items_with_alerts) continue
          const [recipients] = await database.query(recipientsSql, [branch.id,branch.id])
          for (const recipient of recipients) {
            try { delivered += Number(await deliver(branch, recipient, today, summary)) }
            catch (error) { failed++; logger.error('[daily-stock-alerts] delivery failed:', { branch_id: branch.id, target_role: recipient.target_role, target_user_id: recipient.target_user_id, message: error.message }) }
          }
        } catch (error) { failed++; logger.error('[daily-stock-alerts] branch scan failed:', { branch_id: branch.id, message: error.message }) }
      }
      return { delivered, failed }
    } finally { running = false }
  }
  const start = async () => {
    if (timer) return
    // Startup migrations are optional. Require the reviewed ledger migration;
    // never create schema from a timer or discard existing delivery history.
    await database.query('SELECT branch_id FROM inventory_daily_alert_deliveries LIMIT 1')
    const tick = () => { void run().catch(error => logger.error('[daily-stock-alerts]', error.message)) }
    timer = schedule(tick, 5 * 60 * 1000)
    timer.unref?.()
    tick()
  }
  const stop = () => { if (timer) unschedule(timer); timer = null }
  return { run, start, stop }
}

const worker = createDailyStockAlertWorker()
module.exports = { summarizeStockAlerts, recipientsSql, createDailyStockAlertWorker, runDailyStockAlerts: worker.run, startDailyStockAlertWorker: worker.start }
