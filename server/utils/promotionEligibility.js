// Selected offers bind a date-validated discount rule to a booked service.
const { getTodayDateOnly } = require('./date')
const {priceFor}=require('./promotionPricing')
const VERIFIED_ONLY = 'verified'
const isEligiblePatient = async (executor, patientId) => {
  const id = Number(patientId)
  if (!Number.isSafeInteger(id) || id <= 0) return false
  const [[account]] = await executor.query(`SELECT id FROM patients
    WHERE id=? AND COALESCE(is_walk_in,0)=0 AND email IS NOT NULL AND email<>''
      AND phone IS NOT NULL AND phone<>'' AND password IS NOT NULL AND password<>''
      AND email_verified_at IS NOT NULL AND phone_verified_at IS NOT NULL LIMIT 1`, [id])
  return Boolean(account)
}


const parsePromotionId = (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw Object.assign(new Error('Select a valid promotion.'), { status: 400, code: 'INVALID_PROMOTION' })
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw Object.assign(new Error('Select a valid promotion.'), { status: 400, code: 'INVALID_PROMOTION' })
  return id
}

const resolveSelectedPromotion = async (executor, { promotionId, branchId, serviceId, appointmentDate, servicePrice = null, patientId = null, today = getTodayDateOnly(), lock = false }) => {
  const id = parsePromotionId(promotionId)
  if (id === null) return null
  const [[promo]] = await executor.query(`
    SELECT id, branch_id, title, description, badge_text, is_active,discount_type,discount_value,eligibility_type,
           DATE_FORMAT(starts_on,'%Y-%m-%d') AS starts_on,
           DATE_FORMAT(ends_on,'%Y-%m-%d') AS ends_on
    FROM clinic_promotions WHERE id=? AND branch_id=? ${lock ? 'FOR UPDATE' : ''}`, [id, branchId])
  if (!promo || Number(promo.is_active) !== 1 || promo.starts_on > today || promo.ends_on < today ||
      promo.starts_on > appointmentDate || promo.ends_on < appointmentDate) {
    throw Object.assign(new Error('This promotion is no longer available for the selected appointment date. Please choose another offer.'), { status: 409, code: 'PROMOTION_UNAVAILABLE' })
  }
  if (promo.eligibility_type === VERIFIED_ONLY && !await isEligiblePatient(executor, patientId)) {
    throw Object.assign(new Error('This offer requires a registered patient account with verified email and mobile number. You may still book at the regular price.'), {status:403,code:'PROMOTION_VERIFICATION_REQUIRED'})
  }
  const [[linked]] = await executor.query(`
    SELECT ps.service_id FROM clinic_promotion_services ps
    INNER JOIN billing_service_catalog svc ON svc.id=ps.service_id AND svc.branch_id=? AND svc.is_active=1
    WHERE ps.promotion_id=? AND ps.service_id=? LIMIT 1`, [branchId, id, serviceId])
  if (!linked) throw Object.assign(new Error('This promotion is not available for the selected service.'), { status: 409, code: 'PROMOTION_SERVICE_MISMATCH' })
  const quote=priceFor(servicePrice, promo.discount_type, promo.discount_value)
  return { id, title:promo.title, terms:promo.description, badge:promo.badge_text,
    starts_on:promo.starts_on, ends_on:promo.ends_on, service_id:Number(serviceId),
    discount_type:promo.discount_type,discount_value:Number(promo.discount_value||0),
    eligibility_type:promo.eligibility_type||'all',
    discount_amount:quote?.discount||0 }
}

module.exports = { parsePromotionId, resolveSelectedPromotion, isEligiblePatient, VERIFIED_ONLY }


