function supplyPrecision() {
 // All clinic inventory consumables are recorded as whole units.
 return 0
}
function validateSupplyQuantity(value,item={}) {
 const qty=Number(value),precision=supplyPrecision(item),factor=10**precision
 if(!['number','string'].includes(typeof value)||!Number.isFinite(qty)||qty<=0||qty>100000||Math.abs(qty*factor-Math.round(qty*factor))>0.0000001)throw Object.assign(new Error(precision?`${item.name||'Supply'} requires a positive quantity with up to ${precision} decimal places.`:`${item.name||'Supply'} requires a positive whole number of ${item.uom||item.unit||'units'}.`),{statusCode:400,code:precision?'INVALID_SUPPLY_QUANTITY':'WHOLE_UNIT_QUANTITY_REQUIRED'})
 return qty
}
module.exports={supplyPrecision,validateSupplyQuantity}

