// Patient-selected offers are booking intent, never an automatic discount.
const { getTodayDateOnly } = require('./date')

const parsePromotionId = (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw Object.assign(new Error('Select a valid promotion.'), { status: 400, code: 'INVALID_PROMOTION' })
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw Object.assign(new Error('Select a valid promotion.'), { status: 400, code: 'INVALID_PROMOTION' })
  return id
}

const resolveSelectedPromotion = async (executor, { promotionId, branchId, serviceId, appointmentDate, today = getTodayDateOnly(), lock = false }) => {
  const id = parsePromotionId(promotionId)
  if (id === null) return null
  const [[promo]] = await executor.query(`
    SELECT id, branch_id, title, description, badge_text, is_active,
           DATE_FORMAT(starts_on,'%Y-%m-%d') AS starts_on,
           DATE_FORMAT(ends_on,'%Y-%m-%d') AS ends_on
    FROM clinic_promotions WHERE id=? AND branch_id=? ${lock ? 'FOR UPDATE' : ''}`, [id, branchId])
  if (!promo || Number(promo.is_active) !== 1 || promo.starts_on > today || promo.ends_on < today ||
      promo.starts_on > appointmentDate || promo.ends_on < appointmentDate) {
    throw Object.assign(new Error('This promotion is no longer available for the selected appointment date. Please choose another offer.'), { status: 409, code: 'PROMOTION_UNAVAILABLE' })
  }
  const [[linked]] = await executor.query(`
    SELECT ps.service_id FROM clinic_promotion_services ps
    INNER JOIN billing_service_catalog svc ON svc.id=ps.service_id AND svc.branch_id=? AND svc.is_active=1
    WHERE ps.promotion_id=? AND ps.service_id=? LIMIT 1`, [branchId, id, serviceId])
  if (!linked) throw Object.assign(new Error('This promotion is not available for the selected service.'), { status: 409, code: 'PROMOTION_SERVICE_MISMATCH' })
  return { id, title:promo.title, terms:promo.description, badge:promo.badge_text,
    starts_on:promo.starts_on, ends_on:promo.ends_on, service_id:Number(serviceId) }
}

module.exports = { parsePromotionId, resolveSelectedPromotion }
