import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { formatSnapshotValue, snapshotNumericType } from '../../client/src/utils/reviewSnapshotFormat.js'
import { getReviewRecordLink } from '../../client/src/utils/reviewRecordLinks.js'
import { resolveReviewRecordLocation } from '../services/reviewRecordLocation.service.js'

const here = dirname(fileURLToPath(import.meta.url))
const clientRoot = resolve(here, '../../client/src')
const dbStub = (rows, pattern = /FROM seller_groups/) => ({ query: async (sql, params) => {
  assert.match(sql, pattern)
  assert.equal(params.length, 1)
  return [rows]
} })
const reviewOf = (entity_type, entity_id, extras = {}) => ({ entity_type, entity_id, ...extras })

test('plain import totals and other counts are never formatted as pesos', () => {
  for (const field of ['total','ready','create','update','existingUpdates','transfer','warnings','errors','memberCountBefore','importedCount','salesCount','paymentCount']) {
    assert.equal(formatSnapshotValue(field, 3), '3', field)
    assert.equal(formatSnapshotValue(field, '3'), '3')
  }
  assert.equal(snapshotNumericType('total'), 'count')
  assert.equal(formatSnapshotValue('total', 1000), '1,000')
})
test('money, percentages, lookup names, status and leading zeros remain correct', () => {
  assert.equal(formatSnapshotValue('grossCommission', 1250), '₱1,250.00')
  assert.equal(formatSnapshotValue('paymentAmount', 1250.5), '₱1,250.50')
  assert.equal(formatSnapshotValue('poolRate', 8.125), '8.125%')
  assert.equal(formatSnapshotValue('companyProfitRate', '1'), '1%')
  assert.equal(formatSnapshotValue('projectId', 7, { lookups: { project: { '7': 'Bailen Project' } } }), 'Bailen Project')
  assert.equal(formatSnapshotValue('status', 'in_house'), 'In-House')
  assert.equal(formatSnapshotValue('hasApproval', true), 'Yes')
  assert.equal(formatSnapshotValue('broker_license_number', '0893433'), '0893433')
  assert.equal(formatSnapshotValue('phoneNumber', '09175553333'), '09175553333')
})
test('External Network location is resolved from DB even if old snapshot omits type', async () => {
  const review = reviewOf('seller_group', 10, { after_snapshot_json: JSON.stringify({ summary: { total: 3 } }) })
  const location = await resolveReviewRecordLocation(dbStub([{ seller_group_id: 10, seller_group_type: 'external' }]), review)
  assert.deepEqual(location.recordLocation, { kind: 'network', groupId: 10, groupType: 'external' })
  const url = getReviewRecordLink({ review: { ...review, ...location }, actorRole: 'auditor', reviewId: 12, auditCaseId: 8, workflowAction: 'network_edit_review' })
  assert.match(url, /\/portal\/auditor\/accredited\/groups\/external\/10\?/)
  assert.match(url, /reviewView=1/)
  assert.doesNotMatch(url, /workflowAction=/)
})
test('all roles receive correct In-House Network route even when snapshot says External', async () => {
  for (const role of ['auditor','super_admin','system_admin','marketing_staff','marketing_head','operations_head']) {
    const review = reviewOf('seller_group_project_rates', '14:2', { after_snapshot_json: JSON.stringify({ groupType: 'external' }) })
    const connection = { query: async (sql, params) => {
      if (sql.includes('seller_group_lot_project_rates')) {
        assert.deepEqual(params, [14, 2])
        return [[{exists:1}]]
      }
      assert.match(sql,/FROM seller_groups/)
      return [[{ seller_group_id:14,seller_group_type:'in_house' }]]
    } }
    const location = await resolveReviewRecordLocation(connection, review)
    const url = getReviewRecordLink({ review: { ...review, ...location }, actorRole: role, reviewId: 20, workflowAction: 'network_rates_review' })
    assert.match(url, new RegExp(`^/portal/${role}/accredited/groups/in-house/14\\?`))
  }
})
test('missing/deleted/invalid Network cannot be navigated to speculatively', async () => {
  const review = reviewOf('seller_group', 18)
  const missing = await resolveReviewRecordLocation(dbStub([]), review)
  assert.equal(missing.entityExists, false)
  assert.equal(getReviewRecordLink({ review: { ...review, ...missing }, actorRole:'auditor', reviewId: 9 }), null)
  const unknown = await resolveReviewRecordLocation(dbStub([{ seller_group_type: 'legacy' }]), review)
  assert.equal(unknown.entityExists, false)
  assert.equal(unknown.recordLocation, null)
  assert.equal(getReviewRecordLink({ review: { ...review, ...unknown }, actorRole:'auditor', reviewId:9 }), null)
  assert.equal((await resolveReviewRecordLocation(dbStub([]), reviewOf('seller_group', ''))).entityExists, false)
})
test('seller link uses current group membership and type, not previous snapshot', async () => {
  const review = reviewOf('accredited_seller', 7, { after_snapshot_json: JSON.stringify({ sellerGroupId: 2, userId: 14 }) })
  const location = await resolveReviewRecordLocation(dbStub([{ accredited_seller_id:7, seller_group_id:55, user_id:24, seller_group_type:'external' }], /FROM accredited_sellers/), review)
  const url = getReviewRecordLink({ review: { ...review, ...location }, actorRole:'auditor', reviewId:19 })
  assert.match(url, /^\/portal\/auditor\/accredited\/sellers\/7\?/)
  assert.match(url, /sellerId=24/)
  assert.ok(!url.includes('/in-house/'))
})
test('seller without current network still opens its direct read-only profile', async () => {
  const review = reviewOf('accredited_seller', 9)
  const loc = await resolveReviewRecordLocation(dbStub([{ accredited_seller_id: 9, seller_group_id: null, user_id: 15, seller_group_type: null }], /FROM accredited_sellers/), review)
  assert.match(getReviewRecordLink({ review: { ...review, ...loc }, actorRole:'auditor', reviewId:99 }), /\/accredited\/sellers\/9\?/)
})
test('database query failure is not silently treated as success', async () => {
  await assert.rejects(() => resolveReviewRecordLocation({ query: async () => { throw Error('DB offline') } }, reviewOf('seller_group',15)), /DB offline/)
})
test('payment and listing routes require exact verified locations', () => {
  const payment = reviewOf('lot_project_payment', 63, {
    lot_project_slug: 'bailen',
    recordLocation: { kind:'listing_profile', listingId:42, accountId:18, paymentId:63 },
  })
  const link = getReviewRecordLink({ review:payment, actorRole:'auditor', reviewId:9, auditCaseId:5, mode:'view' })
  assert.match(link, /\/listings\/42\/accounts\/18\?/)
  assert.match(link, /paymentId=63/)
  assert.equal(getReviewRecordLink({ review:reviewOf('lot_project_payment', 63, {lot_project_slug:'bailen'}), reviewId:9, mode:'view' }), null)
  const listing = reviewOf('lot_project_listing', 5, { lot_project_slug:'bailen', entityExists:false, action_key:'listing.delete' })
  assert.equal(getReviewRecordLink({ review:listing, reviewId:2, mode:'view' }), null)
})
test('saved form view replaces redundant comparisons and preserves import summary', () => {
  const source = readFileSync(resolve(clientRoot,'pages/System/ReviewCenter.jsx'),'utf8')
  assert.match(source, /ReviewFormComparison/)
  assert.match(source, /NetworkImportReviewSummary before=\{before\} after=\{after\}/)
  assert.match(source, /review\.recordUnavailableReason/)
  assert.doesNotMatch(source, /String\(after\?\.groupType \|\| before\?\.groupType \|\| 'in_house'\)/)
})
test('network project selection retains workflow context and corrects outdated routes', () => {
  const source = readFileSync(resolve(clientRoot,'pages/System/SellerGroupDetails.jsx'),'utf8')
  assert.match(source, /new URLSearchParams\(previous\)/)
  assert.match(source, /next\.set\('project'/)
  assert.match(source, /groups\/\$\{correctSection\}/)
  assert.doesNotMatch(source, /message="This Network was opened from the wrong Network section/)
})



