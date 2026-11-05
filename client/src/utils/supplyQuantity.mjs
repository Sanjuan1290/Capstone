export function supplyPrecision(item={}) {
 if(Number(item.uom_allow_decimal??item.allow_decimal_quantity??0)!==1)return 0
 const n=Number(item.uom_decimal_precision??item.decimal_precision??2)
 return Math.min(2,Math.max(1,Number.isInteger(n)&&n>0?n:2))
}
export function supplyQuantityError(value,item={}) {
 const qty=Number(value),precision=supplyPrecision(item),factor=10**precision
 if(!['number','string'].includes(typeof value)||value===''||!Number.isFinite(qty)||qty<=0||qty>100000||Math.abs(qty*factor-Math.round(qty*factor))>0.0000001)return precision?`Use a positive quantity with up to ${precision} decimal places.`:'Use a positive whole number.'
 return ''
}
