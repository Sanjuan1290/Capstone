// Display helper only. The API makes all final pricing and eligibility decisions.
export const promotionQuote = (price, promotion) => {
  if (price === null || price === undefined || price === '') return null
  const original = Number(price)
  if (!Number.isFinite(original) || original < 0) return null
  const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
  const type=promotion?.discount_type, value=Number(promotion?.discount_value)
  const valid = ['percentage','fixed'].includes(type) && Number.isFinite(value) && value > 0 && (type!=='percentage'||value<=100)
  const discount=valid ? Math.min(cents(original),cents(type==='percentage'?original*value/100:value)) : 0
  return {original:cents(original), discount, current:cents(original-discount)}
}
export const peso = value => `₱${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
