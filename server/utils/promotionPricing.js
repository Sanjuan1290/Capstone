// Promotion prices use integer cent amounts; never apply a discount to inventory lines.
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const validRule = (type, value) => {
  if (!['none','percentage','fixed'].includes(type)) return false
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 && amount <= 99999999.99 &&
    (type !== 'percentage' || amount <= 100) && (type === 'none' ? amount === 0 : amount > 0)
}
const amountFor = (basePrice, type, value) => {
  const base = Number(basePrice)
  if (!Number.isFinite(base) || base < 0 || !validRule(type, value) || type === 'none') return 0
  return Math.min(money(base), money(type === 'percentage' ? base * Number(value) / 100 : value))
}
const priceFor = (basePrice, type, value) => {
  const base = Number(basePrice)
  if (!Number.isFinite(base) || base < 0) return null
  const original = money(base)
  const discount = amountFor(original, type, value)
  return {original, discount, current:money(original-discount)}
}
module.exports={money,validRule,amountFor,priceFor}
