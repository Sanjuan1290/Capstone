// Review navigation must use the backend-verified current location, not
// identifiers guessed from historical snapshots. Modes never grant permission.
const validId = (value) => {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
const slugParam = (value) => encodeURIComponent(String(value))
export const getReviewRecordLink = ({
  review, actorRole, reviewId, auditCaseId, workflowAction = '', mode = 'view',
} = {}) => {
  if (!review || review.entityExists === false || review.action_key === 'network.delete' || !validId(reviewId)) return null
  const location = review.recordLocation || {}
  const params = new URLSearchParams()
  params.set('reviewId', String(reviewId))
  if (auditCaseId) params.set('auditCaseId', String(auditCaseId))
  if (mode === 'view') {
    params.set('reviewView', '1')
    params.set('reviewEntityType', String(review.entity_type || ''))
    params.set('reviewTargetId', String(review.entity_id || ''))
  } else {
    params.set('workflowAction', workflowAction)
  }
  const root = `/portal/${slugParam(actorRole || 'super_admin')}`
  const networkTypeSegment = location.groupType === 'external' ? 'external' : location.groupType === 'in_house' ? 'in-house' : null
  if (location.kind === 'network' || location.kind === 'seller') {
    if (validId(location.projectId)) params.set('project', String(location.projectId))
    if (location.kind === 'network' && (!validId(location.groupId || location.sellerGroupId) || !networkTypeSegment)) return null
    if (location.kind === 'seller') {
      if (!validId(location.sellerUserId) || !validId(location.sellerId)) return null
      params.set('sellerId', String(location.sellerUserId))
      params.set('accreditedSellerId', String(location.sellerId))
      // The dedicated seller profile fetches the exact ID itself, so pagination
      // of the Network member list can never hide or substitute the seller.
      if (mode === 'view') return `${root}/accredited/sellers/${location.sellerId}?${params}`
      params.set('workflowAction','seller_edit_review')
      if (!validId(location.sellerGroupId) || !networkTypeSegment) return null
    }
    return `${root}/accredited/groups/${networkTypeSegment}/${location.groupId || location.sellerGroupId}?${params}`
  }
  const slug = review.lot_project_slug
  if (!slug) return null
  const encodedSlug = slugParam(slug)
  if (location.kind === 'listing_profile') {
    if (!validId(location.listingId)) return null
    const accountPart = validId(location.accountId) ? `/accounts/${location.accountId}` : ''
    const type = String(review.entity_type || '')
    const accountTypes = ['lot_project_payment','lot_project_payment_proof','lot_project_signed_receipt','lot_project_client_profile','lot_project_account','lot_project_reservation','lot_project_cancellation','lot_project_commission_account','lot_project_penalty_schedule','lot_project_lmf_schedule']
    if (accountTypes.includes(type) && !validId(location.accountId)) return null
    if (['lot_project_payment','lot_project_payment_proof','lot_project_signed_receipt'].includes(type) && !validId(location.paymentId)) return null
    if (['lot_project_penalty_schedule','lot_project_lmf_schedule'].includes(type) && !validId(location.scheduleId)) return null
    if (location.paymentId) params.set('paymentId', String(location.paymentId))
    if (location.proofId) params.set('proofId', String(location.proofId))
    if (location.scheduleId) params.set('scheduleId', String(location.scheduleId))
    if (mode === 'view') {
      const tabByType = {
        lot_project_listing:'unit', lot_project_client_profile:'client',
        lot_project_payment:'payments', lot_project_payment_proof:'payments',
        lot_project_signed_receipt:'printouts', lot_project_lmf_schedule:'payments',
        lot_project_penalty_schedule:'payments', lot_project_commission_account:'unit',
        lot_project_reservation:'unit', lot_project_cancellation:'unit',
        lot_project_account:'unit',
      }
      if (tabByType[type]) params.set('reviewTab', tabByType[type])
    }
    return `/portal/lot-projects/${encodedSlug}/listings/${location.listingId}${accountPart}?${params}`
  }
  if (review.entity_type === 'lot_project_settings')
    return `/portal/lot-projects/${encodedSlug}/settings?${params}`
  if (review.entity_type === 'lot_project_commission') {
    if (!validId(review.entity_id)) return null
    params.set('commissionId', String(review.entity_id))
    return `/portal/lot-projects/${encodedSlug}/commissions?${params}`
  }
  return null
}

