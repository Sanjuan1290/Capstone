// Review links point to the *current*, verified record, never to IDs guessed
// from a historical snapshot. Missing records keep their saved Review visible.
const positiveId = (value) => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
const snapshot = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) || {} } catch { return {} }
}
const notFound = (message = 'Record no longer available. Its saved review is still shown here.') => ({
  entityExists: false, recordLocation: null, recordUnavailableReason: message,
})
const missing = () => notFound('The original record could not be identified. Its saved review is still available.')
const typeRecord = {
  lot_project_listing: {table:'lot_project_listings',pk:'lot_project_listing_id'},
  lot_project_client_profile: {table:'lot_project_client_profiles',pk:'lot_project_client_profile_id'},
  lot_project_payment: {table:'lot_project_payments',pk:'lot_project_payment_id'},
  // Proof and signed receipt Reviews use the payment ID, not a file ID.
  lot_project_payment_proof: {table:'lot_project_payments',pk:'lot_project_payment_id'},
  lot_project_signed_receipt: {table:'lot_project_payments',pk:'lot_project_payment_id'},
  lot_project_reservation: {table:'lot_project_accounts',pk:'lot_project_account_id'},
  lot_project_cancellation: {table:'lot_project_accounts',pk:'lot_project_account_id'},
  lot_project_commission_account: {table:'lot_project_accounts',pk:'lot_project_account_id'},
  lot_project_account: {table:'lot_project_accounts',pk:'lot_project_account_id'},
  lot_project_penalty_schedule: {table:'lot_project_payment_schedules',pk:'lot_project_payment_schedule_id'},
  lot_project_lmf_schedule: {table:'lot_project_payment_schedules',pk:'lot_project_payment_schedule_id'},
}

export async function resolveReviewRecordLocation(connection, review) {
  const type = String(review?.entity_type || '')
  const after = snapshot(review?.after_snapshot_json)
  const before = snapshot(review?.before_snapshot_json)
  const entityId = positiveId(String(review?.entity_id || '').split(':')[0])
  if (type === 'seller_group' || type === 'seller_group_project_rates') {
    const id = entityId || positiveId(after.groupId) || positiveId(before.groupId)
    if (!id) return missing()
    const [rows] = await connection.query(
      'SELECT seller_group_id, seller_group_type FROM seller_groups WHERE seller_group_id=? LIMIT 1', [id]
    )
    if (!rows?.length) return notFound('This Network no longer exists. Its saved review is still available.')
    const networkType = rows[0].seller_group_type
    if (!['external', 'in_house'].includes(networkType)) return notFound('This Network has no valid type.')
    let projectId = null
    if (type === 'seller_group_project_rates') {
      projectId = positiveId(String(review.entity_id || '').split(':')[1]) || positiveId(after.projectId) || positiveId(before.projectId)
      if (!projectId) return notFound('The exact project for these Network rates could not be identified. View the saved review instead.')
      if (projectId) {
        const [projectRows] = await connection.query(
          'SELECT 1 FROM seller_group_lot_project_rates WHERE seller_group_id=? AND lot_project_id=? LIMIT 1',
          [id, projectId]
        )
        if (!projectRows.length) return notFound('These project rates are no longer available. View the saved review instead.')
      }
    }
    return { entityExists:true, recordLocation:{kind:'network',groupId:id,groupType:networkType,...(projectId?{projectId}:{})},recordUnavailableReason:null }
  }
  if (type === 'accredited_seller') {
    const id = entityId || positiveId(after.accreditedSellerId) || positiveId(before.accreditedSellerId)
    if (!id) return missing()
    const [rows] = await connection.query(`
      SELECT a.accredited_seller_id, a.seller_group_id, a.user_id, g.seller_group_type
      FROM accredited_sellers a LEFT JOIN seller_groups g ON g.seller_group_id = a.seller_group_id
      WHERE a.accredited_seller_id=? LIMIT 1`, [id])
    if (!rows?.length) return notFound('This seller no longer exists. Its saved review is still available.')
    const row=rows[0]
    const verifiedType = ['external','in_house'].includes(row.seller_group_type) ? row.seller_group_type:null
    // A seller remains inspectable after removal from a Network. Direct view
    // requires only the exact seller ID; editing still requires valid context.
    return {entityExists:true,recordLocation:{kind:'seller',sellerId:id,sellerUserId:Number(row.user_id),sellerGroupId:positiveId(row.seller_group_id),groupType:verifiedType},recordUnavailableReason:null}
  }
  // Fixed table/primary-key allowlist. The joined account is used to open the
  // exact buyer history rather than silently opening a different unit buyer.
  const specification = typeRecord[type]
  if (specification) {
    // Entity ID is the primary key for THIS record type, not an unrelated
    // payment/listing ID saved as metadata in a different review.
    const id = entityId

    if (!id) return missing()
    const {table,pk}=specification
    const [rows] = await connection.query(`SELECT * FROM ${table} WHERE ${pk}=? LIMIT 1`,[id])
    if (!rows?.length) return notFound()
    const row=rows[0]
    if (review.lot_project_id && Number(row.lot_project_id) !== Number(review.lot_project_id)) return notFound()
    const listingId=positiveId(row.lot_project_listing_id) || (type==='lot_project_listing'?id:null)
    if (!listingId) return missing()
    let accountId=positiveId(row.lot_project_account_id)
    const profileId=positiveId(row.lot_project_client_profile_id) || (type==='lot_project_client_profile'?id:null)
    if (!accountId && profileId) {
      const [accountRows]=await connection.query(`SELECT lot_project_account_id,lot_project_listing_id,lot_project_id FROM lot_project_accounts WHERE lot_project_client_profile_id=? LIMIT 2`,[profileId])
      // A profile associated with multiple historical accounts needs explicit
      // identification; never open an arbitrary account returned by LIMIT 1.
      if (accountRows.length > 1) return notFound('Multiple buyer accounts refer to this profile. The exact reviewed account cannot be inferred.')
      if (accountRows.length) {
        if (Number(accountRows[0].lot_project_listing_id)!==listingId || Number(accountRows[0].lot_project_id)!==Number(row.lot_project_id)) return notFound()
        accountId=positiveId(accountRows[0].lot_project_account_id)
      }
    }
    if (['lot_project_payment','lot_project_payment_proof','lot_project_signed_receipt','lot_project_client_profile','lot_project_penalty_schedule','lot_project_lmf_schedule'].includes(type) && !accountId) return notFound('The exact buyer account could not be found. View the saved review instead.')
    return {entityExists:true,recordLocation:{kind:'listing_profile',listingId,accountId: accountId || (['lot_project_account','lot_project_commission_account','lot_project_reservation','lot_project_cancellation'].includes(type)?id:null),paymentId:['lot_project_payment','lot_project_payment_proof','lot_project_signed_receipt'].includes(type)?id:positiveId(row.lot_project_payment_id),proofId:null,scheduleId:['lot_project_penalty_schedule','lot_project_lmf_schedule'].includes(type)?id:null},recordUnavailableReason:null}
  }
  // All other types keep their existing review view; no unverified deep link.
  return { entityExists:true,recordLocation:null,recordUnavailableReason:null }
}

