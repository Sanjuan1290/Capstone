export function supplyPrecision() {
 // Consultation quantities are whole items, regardless of legacy UOM settings.
 return 0
}
export function supplyQuantityError(value,item={}) {
 const qty=Number(value),precision=supplyPrecision(item),factor=10**precision
 if(!['number','string'].includes(typeof value)||value===''||!Number.isFinite(qty)||qty<=0||qty>100000||Math.abs(qty*factor-Math.round(qty*factor))>0.0000001)return precision?`Use a positive quantity with up to ${precision} decimal places.`:'Use a positive whole number.'
 return ''
}

