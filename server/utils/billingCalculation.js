const M=require('./billingMoney')
const {doctorFeeAllocations}=require('./doctorFeeAllocation')
const {disabledPolicy}=require('./billingTaxPolicy')
const fail=(message,code='BILLING_CALCULATION_INVALID')=>Object.assign(new Error(message),{statusCode:409,code})
const detailsOf=item=>typeof item.details_json==='string'?JSON.parse(item.details_json):item.details_json||item.details||{}

function billingComponents(items){
 const components=[],seen=new Set()
 for(const [index,item] of items.entries()){
  if(item.id){if(seen.has(Number(item.id)))throw fail('A saved charge appears twice.');seen.add(Number(item.id))}
  const details=detailsOf(item),quantity=Number(item.quantity??1),lineTotal=M.cents(item.line_total),prefix=`line:${index}`
  if(lineTotal<0n||!Number.isFinite(quantity)||quantity<=0)throw fail('Charge quantities and amounts must be positive.')
  const base={line_index:index,billing_item_id:item.id||null,catalog_service_id:item.catalog_service_id||null,service_name:item.service_name}
  let included=0n
  if(item.item_type==='service'){
   const materialIds=new Set()
   for(const [mi,material] of (details.materials||[]).entries()){
    if(material.consultation_extra)continue // These have their own additional charge line.
    const billed=Number(material.charge_quantity??material.quantity??0),actual=Number(material.quantity||0)
    const used=details.usage_overridden?Math.min(billed,actual):billed
    const unit=M.cents(material.charge_unit_price??0)
    const amount=M.multiply(M.multiply(unit,used),quantity)
    if(amount<=0n)continue
    if(materialIds.has(Number(material.inventory_id)))throw fail('An included inventory item is listed twice in the same service.')
    materialIds.add(Number(material.inventory_id));included+=amount
    components.push({...base,key:`${prefix}:item:${mi}`,kind:'inventory',charge_id:Number(material.inventory_id),name:material.material_name,quantity:used*quantity,unit_price:M.fromCents(unit),included:true,amount})
   }
   if(included>lineTotal)throw fail('Included item totals exceed the saved service subtotal. Review the service pricing.')
   components.push({...base,key:`${prefix}:service`,kind:'service_fee',charge_id:Number(item.catalog_service_id||0),name:item.service_name,quantity,unit_price:M.fromCents(M.divideRound((lineTotal-included)*10000n,M.scaled(quantity,4))),included:false,amount:lineTotal-included})
  }else components.push({...base,key:`${prefix}:charge`,kind:item.item_type==='supply'?'inventory':'additional',charge_id:item.item_type==='supply'?Number(item.source_inventory_id||0):1,name:item.service_name,quantity,unit_price:Number(item.unit_price||0),included:false,amount:lineTotal})
 }
 return components
}

function allocate(amount,rows){
 const total=rows.reduce((s,row)=>s+row.remaining,0n)
 if(amount<0n||amount>total)throw fail('A discount exceeds its eligible charges.','DISCOUNT_EXCEEDS_ELIGIBLE_AMOUNT')
 if(!amount)return []
 const allocations=rows.map(row=>({row,amount:amount*row.remaining/total,remainder:amount*row.remaining%total}))
 let leftover=amount-allocations.reduce((s,r)=>s+r.amount,0n)
 for(const entry of [...allocations].sort((a,b)=>a.remainder===b.remainder?0:a.remainder>b.remainder?-1:1)){if(!leftover)break;entry.amount++;leftover--}
 return allocations
}

function calculateFinancialBill({items=[],policy=disabledPolicy(),discounts=[]}){
 const components=billingComponents(items),rules=new Map((policy.rules||[]).map(rule=>[`${rule.kind}:${rule.id}`,rule]))
 const rate=M.percentage(policy.tax_rate||0),subtotal=components.reduce((s,row)=>s+row.amount,0n)
 const rows=components.map(row=>{
  const rule=rules.get(`${row.kind}:${row.charge_id}`)
  if(policy.enabled&&row.amount>0n&&!rule)throw fail(`Classify ${row.name} in the saved tax policy before billing it.`,'TAX_CLASSIFICATION_REQUIRED')
  return {...row,remaining:row.amount,treatment:rule?.treatment||'out_of_scope',statutory_eligible:rule?.statutory_eligible||false,discount:0n,vat_relief:0n}
 })
 const stat=discounts.filter(d=>['senior','pwd'].includes(d.type)),promotion=discounts.some(d=>d.type==='promotion'&&Number(d.amount)>0)
 if(stat.length>1||stat.length&&promotion)throw fail('Choose one statutory discount or a promotion. They cannot be combined.','INVALID_DISCOUNT_COMBINATION')
 if(stat.some(d=>!d.verified))throw fail('Verify the patient\u2019s statutory discount eligibility first.','DISCOUNT_VERIFICATION_REQUIRED')
 const applied=[],keys=new Set()
 const ordered=[...discounts.filter(d=>!['senior','pwd'].includes(d.type)),...stat]
 for(const d of ordered){
  if(keys.has(d.key))throw fail('The same discount cannot be applied twice.','DUPLICATE_DISCOUNT');keys.add(d.key)
  const statutory=['senior','pwd'].includes(d.type)
  const eligible=rows.filter(row=>row.remaining>0n&&(!statutory||row.statutory_eligible)&&(!d.line_indexes||d.line_indexes.includes(row.line_index))&&(!d.target_kind||row.kind===d.target_kind)&&(!d.target_id||row.charge_id===Number(d.target_id))&&(!d.service_id||Number(row.catalog_service_id)===Number(d.service_id)))
  if(statutory&&!eligible.length)throw fail('No charges are marked eligible for this statutory discount.','DISCOUNT_ELIGIBILITY_REQUIRED')
  if(statutory&&policy.enabled&&policy.tax_mode==='inclusive')for(const row of eligible){if(row.treatment==='taxable'){
   const net=M.divideRound(row.remaining*10000n,10000n+M.scaled(rate,2));row.vat_relief=row.remaining-net;row.remaining=net
  }}
  const eligibleAmount=eligible.reduce((s,row)=>s+row.remaining,0n)
  const amount=d.mode==='percentage'?M.percentOf(eligibleAmount,statutory?20:d.value):M.cents(d.amount??d.value??0)
  const distribution=allocate(amount,eligible)
  for(const entry of distribution){entry.row.remaining-=entry.amount;entry.row.discount+=entry.amount}
  if(statutory)for(const row of eligible)row.statutory_exempt=true
  applied.push({...d,eligible_amount:M.fromCents(eligibleAmount),actual_deduction:M.fromCents(amount),amount:M.fromCents(amount),allocations:distribution.map(a=>({component_key:a.row.key,amount:M.fromCents(a.amount)}))})
 }
 let tax=0n,taxable=0n,exempt=0n,payable=0n,relief=0n
 const output=rows.map(row=>{
  let calculatedTax=0n,taxableAmount=0n,exemptAmount=0n,final=row.remaining
  if(row.statutory_exempt||row.treatment==='vat_exempt')exemptAmount=final
  else if(policy.enabled&&row.treatment==='taxable'){
   if(policy.tax_mode==='exclusive'){taxableAmount=final;calculatedTax=M.percentOf(final,rate);final+=calculatedTax}
   else{taxableAmount=M.divideRound(final*10000n,10000n+M.scaled(rate,2));calculatedTax=final-taxableAmount}
  }
  tax+=calculatedTax;taxable+=taxableAmount;exempt+=exemptAmount;payable+=final;relief+=row.vat_relief
  const {amount,remaining,discount,vat_relief,...rest}=row
  return {...rest,amount:M.fromCents(amount),discount_amount:M.fromCents(discount),vat_relief:M.fromCents(vat_relief),taxable_amount:M.fromCents(taxableAmount),vat_exempt_amount:M.fromCents(exemptAmount),tax_amount:M.fromCents(calculatedTax),payable_amount:M.fromCents(final)}
 })
 const discountTotal=applied.reduce((s,d)=>s+M.cents(d.actual_deduction),0n)
 const addedTax=policy.enabled&&policy.tax_mode==='exclusive'?tax:0n
 if(payable!==subtotal-discountTotal-relief+addedTax)throw fail('Billing calculation did not reconcile.')
 return {schema_version:2,components:output,doctor_fees:doctorFeeAllocations(items).map(({clinic_base_share,...fee})=>fee),discounts:applied,subtotal:M.fromCents(subtotal),discount_amount:M.fromCents(discountTotal),tax:{enabled:policy.enabled,name:policy.tax_name,rate:policy.enabled?rate:0,mode:policy.tax_mode,taxable_amount:M.fromCents(taxable),vat_exempt_amount:M.fromCents(exempt),vat_relief:M.fromCents(relief),amount:M.fromCents(tax),added_amount:M.fromCents(addedTax)},total_amount:M.fromCents(payable)}
}

function computeSimpleBillingTotals({items=[],discount_amount=0}){
 const subtotal=items.reduce((s,item)=>s+M.cents(item.line_total),0n),requested=M.cents(discount_amount),discount=requested<0n?0n:requested
 return {subtotal:M.fromCents(subtotal),discount_amount:M.fromCents(discount),total_amount:M.fromCents(subtotal>discount?subtotal-discount:0n)}
}
module.exports={billingComponents,calculateFinancialBill,computeSimpleBillingTotals,allocate}
