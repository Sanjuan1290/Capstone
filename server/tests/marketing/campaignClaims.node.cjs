'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.resolve(__dirname, '../../utils/marketingCampaigns.js'), 'utf8')

function mockDatabase({ recipients = [11, 12], failQuotaUpdate = false } = {}) {
  const rows = recipients.map(patient_id => ({ id: patient_id + 100, patient_id, status: 'pending' }))
  const quota = new Map()
  const queries = []
  let failNextQuotaUpdate = failQuotaUpdate
  let campaignBusy = false
  const waiters = []
  const acquireCampaign = async () => {
    if (!campaignBusy) { campaignBusy = true; return }
    await new Promise(resolve => waiters.push(resolve))
  }
  const releaseCampaign = () => {
    const next = waiters.shift()
    if (next) next()
    else campaignBusy = false
  }
  const db = {
    get queries() { return queries },
    get recipients() { return rows },
    async getConnection() {
      let locked = false
      let snapshot
      return {
        async beginTransaction() {
          snapshot = { rows: rows.map(row => ({ ...row })), quota: new Map(quota) }
        },
        async query(sql, params = []) {
          queries.push(String(sql))
          if (/SELECT id FROM marketing_campaigns.+FOR UPDATE/i.test(sql)) {
            await acquireCampaign()
            locked = true
            return [[{ id: params[0] }]]
          }
          if (/SELECT r\.id,r\.patient_id FROM marketing_campaign_recipients/i.test(sql)) {
            const row = rows.find(item => item.status === 'pending')
            return row ? [[{ id: row.id, patient_id: row.patient_id }]] : [[]]
          }
          if (/INSERT IGNORE INTO marketing_send_quota/i.test(sql)) {
            const key = `${params[0]}:${params[1]}`
            if (!quota.has(key)) quota.set(key, 0)
            return [{ affectedRows: 1 }]
          }
          if (/UPDATE marketing_send_quota SET reserved=reserved\+1/i.test(sql)) {
            if (failNextQuotaUpdate) {
              failNextQuotaUpdate = false
              throw new Error('synthetic quota transaction failure')
            }
            const key = `${params[0]}:${params[1]}`
            const current = quota.get(key) || 0
            if (current >= params[2]) return [{ affectedRows: 0 }]
            quota.set(key, current + 1)
            return [{ affectedRows: 1 }]
          }
          if (/UPDATE marketing_campaign_recipients SET status='sending'/i.test(sql)) {
            const row = rows.find(item => item.id === params[0])
            if (row) row.status = 'sending'
            return [{ affectedRows: row ? 1 : 0 }]
          }
          throw new Error(`Unexpected SQL in campaign claim test: ${sql}`)
        },
        async commit() { if (locked) { locked = false; releaseCampaign() } },
        async rollback() {
          rows.splice(0, rows.length, ...snapshot.rows.map(row => ({ ...row })))
          quota.clear()
          for (const [key, value] of snapshot.quota) quota.set(key, value)
          if (locked) { locked = false; releaseCampaign() }
        },
        release() {},
      }
    },
  }
  return db
}

function loadMarketing(db, provider) {
  const module = { exports: {} }
  const context = {
    module,
    exports: module.exports,
    process: { env: { DB_PROVIDER: provider } },
    console,
    Date,
    AbortSignal,
    fetch: globalThis.fetch,
    require(name) {
      if (name === '../db/connect') return db
      if (name === './date') return { getClinicDateTimeSql: () => '2026-10-20 12:34:56' }
      if (name === './resendEmail') return { sendResendEmail: async () => 'mocked-message-id' }
      return require(name)
    },
  }
  vm.runInNewContext(source, context, { filename: 'marketingCampaigns.js' })
  return module.exports
}

test('simultaneous TiDB workers claim distinct recipients while using supported FOR UPDATE locking', async () => {
  const db = mockDatabase()
  const { reserveAndClaim } = loadMarketing(db, 'tidb')
  const claims = await Promise.all([reserveAndClaim(7), reserveAndClaim(7)])
  assert.deepEqual(claims.map(row => row.patient_id).sort(), [11, 12])
  assert.deepEqual(db.recipients.map(row => row.status), ['sending', 'sending'])
  const claimSql = db.queries.find(sql => /SELECT r\.id,r\.patient_id FROM marketing_campaign_recipients/i.test(sql))
  assert.match(claimSql, /LIMIT 1 FOR UPDATE$/)
  assert.doesNotMatch(claimSql, /SKIP LOCKED/i)
})

test('claim transaction failures roll back quota reservations and permit safe retry', async () => {
  const db = mockDatabase({ recipients: [21], failQuotaUpdate: true })
  const { reserveAndClaim } = loadMarketing(db, 'tidb')
  await assert.rejects(reserveAndClaim(8), /synthetic quota transaction failure/)
  assert.equal(db.recipients[0].status, 'pending')
  const [retry] = await Promise.all([reserveAndClaim(8)])
  assert.equal(retry.patient_id, 21)
  assert.equal(db.recipients[0].status, 'sending')
})

test('MySQL keeps its existing SKIP LOCKED query variant', async () => {
  const db = mockDatabase({ recipients: [31] })
  const { reserveAndClaim } = loadMarketing(db, 'mysql')
  assert.equal((await reserveAndClaim(9)).patient_id, 31)
  const claimSql = db.queries.find(sql => /SELECT r\.id,r\.patient_id FROM marketing_campaign_recipients/i.test(sql))
  assert.match(claimSql, /LIMIT 1 FOR UPDATE SKIP LOCKED$/)
})

