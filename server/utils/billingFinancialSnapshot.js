const {loadTaxPolicy,disabledPolicy,parse}=require('./billingTaxPolicy')
const {calculateFinancialBill}=require('./billingCalculation')
const {detailsFor}=require('./billingServicePromotions')
const fail=(message,code='BILL_FINANCIAL_SNAPSHOT_REQUIRED')=>Object.assign(new Error(message),{statusCode:409,code})

async function readFinancialSnapshot(billingId,branchId,conn){
 const [[row]]=await conn.query('SELECT policy_json,calculation_json,confirmed_at FROM billing_financial_snapshots WHERE billing_id=? AND branch_id=?',[billingId,branchId])
 return row?{policy:row.policy_json?parse(row.policy_json):null,calculation:row.calculation_json?parse(row.calculation_json):null,confirmed_at:row.confirmed_at}:null
}
async function ensureBillPolicy(billingId,branchId,conn,{newBill=false}={}){
 const existing=await readFinancialSnapshot(billingId,branchId,conn)
 if(existing?.policy)return existing
 // Bills predating the feature preserve their previous disabled-tax treatment.
 const policy=newBill?await loadTaxPolicy(branchId,conn):disabledPolicy()
 await conn.query('INSERT INTO billing_financial_snapshots (billing_id,branch_id,policy_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE policy_json=COALESCE(policy_json,VALUES(policy_json))',[billingId,branchId,JSON.stringify(policy)])
 return {...existing,policy}
}

async function buildDiscounts(bill,policy,conn,{preset,verification}={}){
 const descriptors=[]
 for(const [index,item] of bill.items.entries()){
  const offer=detailsFor(item).applied_promotion
  if(offer&&Number(offer.amount)>0)descriptors.push({key:`promotion:${index}`,type:'promotion',name:offer.title,mode:'fixed',amount:Number(offer.amount),configured_mode:offer.discount_type,configured_value:offer.discount_value,line_indexes:[index]})
 }
 const [reductions]=await conn.query("SELECT id,target_type,catalog_service_id,inventory_id,requested_amount,approved_by_admin_id FROM billing_charge_adjustments WHERE billing_id=? AND branch_id=? AND status='approved' ORDER BY id",[bill.id,bill.branch_id])
 for(const reduction of reductions)descriptors.push({key:`reduction:${reduction.id}`,type:'charge_reduction',name:'Approved Charge Reduction',mode:'fixed',amount:Number(reduction.requested_amount),target_kind:reduction.target_type==='service_fee'?'service_fee':'inventory',target_id:reduction.target_type==='service_fee'?Number(reduction.catalog_service_id):Number(reduction.inventory_id),service_id:Number(reduction.catalog_service_id),approval:{admin_id:reduction.approved_by_admin_id,adjustment_id:reduction.id}})
 if(preset){
  const category=policy.discount_categories?.[preset.preset?.id]||'other',statutory=['senior','pwd'].includes(category)
  if(statutory&&!verification?.verified)throw fail('Verify the patient’s eligibility before applying this statutory discount.','DISCOUNT_VERIFICATION_REQUIRED')
  if(preset.amount>0||statutory)descriptors.push({key:`preset:${preset.preset?.id||'saved'}`,type:category,name:preset.label||'Authorized Discount',mode:statutory?'percentage':preset.preset?.requires_admin_approval||!preset.preset?'fixed':preset.type==='percentage'?'percentage':'fixed',value:preset.preset?.value||0,amount:Number(preset.amount),preset_id:preset.preset?.id||null,verified:statutory?true:undefined,verification:statutory?{actor_role:verification.actor_role,actor_id:verification.actor_id,reference_recorded:Boolean(String(verification.reference||'').trim())}:undefined,approval:preset.approval||null})
 }
 return descriptors
}

async function refreshDraftFinancialTotals(billingId,branchId,conn,options={}){
 const priorSnapshot=await readFinancialSnapshot(billingId,branchId,conn)
 if(options.preserveLegacy&&!priorSnapshot?.policy)return null
 const {getBillingRecordWithItems}=require('./billing')
 const bill=options.bill||await getBillingRecordWithItems(billingId,conn)
 if(!bill||Number(bill.branch_id)!==Number(branchId))throw fail('Bill not found in this branch.')
 if(!['draft','pending'].includes(bill.status))return bill.financial_calculation||null // Never recalculate confirmed history.
 const snapshot=await ensureBillPolicy(billingId,branchId,conn,options)
 if(snapshot.confirmed_at)throw fail('Reopen this bill through the authorized correction workflow before changing calculations.')
 let discounts=await buildDiscounts(bill,snapshot.policy,conn,options)
 if(options.preset===undefined){
  const saved=(snapshot.calculation?.discounts||[]).filter(d=>['other','pwd','senior'].includes(d.type))
  if(saved.length)discounts.push(...saved)
  else{
   const known=discounts.reduce((sum,d)=>sum+Number(d.amount||0),0),remaining=Math.round((Number(bill.discount_amount||0)-known)*100)/100
   if(remaining>0)discounts.push({key:'legacy-authorized-discount',type:'other',name:bill.discount_label||'Saved Authorized Discount',mode:'fixed',amount:remaining})
  }
 }
 const calculation=calculateFinancialBill({items:bill.items,policy:snapshot.policy,discounts})
 await conn.query('UPDATE billing_financial_snapshots SET calculation_json=?,updated_at=CURRENT_TIMESTAMP WHERE billing_id=? AND branch_id=? AND confirmed_at IS NULL',[JSON.stringify(calculation),billingId,branchId])
 await conn.query("UPDATE billing_records SET subtotal=?,discount_amount=?,total_amount=? WHERE id=? AND branch_id=? AND status IN ('draft','pending')",[calculation.subtotal,calculation.discount_amount,calculation.total_amount,billingId,branchId])
 return calculation
}

async function confirmFinancialSnapshot(bill,conn){
 const snapshot=await readFinancialSnapshot(bill.id,bill.branch_id,conn)
 // A legacy bill can be confirmed without changing any of its original totals.
 if(!snapshot?.policy){await ensureBillPolicy(bill.id,bill.branch_id,conn);await refreshDraftFinancialTotals(bill.id,bill.branch_id,conn)}
 const current=await readFinancialSnapshot(bill.id,bill.branch_id,conn)
 if(!current?.calculation||Math.abs(Number(current.calculation.total_amount)-Number(bill.total_amount))>0.001)throw fail('Save the current bill review before confirmation.','BILL_REVIEW_REQUIRED')
 await conn.query('UPDATE billing_financial_snapshots SET confirmed_at=COALESCE(confirmed_at,CURRENT_TIMESTAMP) WHERE billing_id=? AND branch_id=?',[bill.id,bill.branch_id])
 return current.calculation
}
module.exports={readFinancialSnapshot,ensureBillPolicy,buildDiscounts,refreshDraftFinancialTotals,confirmFinancialSnapshot}
