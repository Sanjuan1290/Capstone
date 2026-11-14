const {percentage}=require('./billingMoney')
const fail=message=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_TAX_POLICY'})
const disabledPolicy=()=>({enabled:false,tax_name:'VAT',tax_rate:0,tax_mode:'inclusive',rules:[],discount_categories:{},version:0})
const parse=value=>typeof value==='string'?JSON.parse(value):value
function normalizePolicy(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Enter a billing tax configuration.')
 if(typeof body.enabled!=='boolean')throw fail('Choose whether tax is enabled.')
 if(body.tax_name!=null&&typeof body.tax_name!=='string')throw fail('Enter a text tax name.')
 const policy={enabled:body.enabled,tax_name:String(body.tax_name||'VAT').trim(),tax_rate:percentage(body.tax_rate??0),tax_mode:body.tax_mode,rules:[],discount_categories:{}}
 if(!policy.tax_name||policy.tax_name.length>80||/[<>\x00-\x1f]/.test(policy.tax_name))throw fail('Enter a tax name of 1–80 characters.')
 if(!['inclusive','exclusive'].includes(policy.tax_mode))throw fail('Choose inclusive or exclusive tax treatment.')
 if(!Array.isArray(body.rules)||body.rules.length>10000)throw fail('Enter valid charge classifications.')
 const seen=new Set()
 for(const row of body.rules){
  if(!row||typeof row!=='object'||Array.isArray(row)||!['number','string'].includes(typeof row.id)||!['service_fee','inventory','additional'].includes(row.kind)||!Number.isSafeInteger(Number(row.id))||Number(row.id)<=0||!['taxable','vat_exempt','out_of_scope'].includes(row.treatment)||typeof row.statutory_eligible!=='boolean')throw fail('Every classification requires a valid charge, treatment and statutory eligibility choice.')
  if(row.kind==='additional'&&Number(row.id)!==1)throw fail('Invalid custom-charge classification.')
  const key=`${row.kind}:${Number(row.id)}`;if(seen.has(key))throw fail('A charge cannot have duplicate tax classifications.');seen.add(key)
  policy.rules.push({kind:row.kind,id:Number(row.id),treatment:row.treatment,statutory_eligible:row.statutory_eligible})
 }
 if(body.discount_categories!=null&&(typeof body.discount_categories!=='object'||Array.isArray(body.discount_categories)))throw fail('Enter valid discount categories.')
 for(const [id,category] of Object.entries(body.discount_categories||{})){
  if(!/^[1-9]\d*$/.test(id)||!['senior','pwd','other'].includes(category))throw fail('Choose Senior Citizen, PWD or Other for each discount.')
  policy.discount_categories[id]=category
 }
 if(policy.enabled&&!policy.rules.length)throw fail('Classify the applicable services and inventory items before enabling tax.')
 return policy
}
async function loadTaxPolicy(branchId,conn){
 const [[row]]=await conn.query('SELECT policy_json,version FROM branch_billing_settings WHERE branch_id=?',[branchId])
 return row?{...normalizePolicy(parse(row.policy_json)),version:Number(row.version)}:disabledPolicy()
}
module.exports={disabledPolicy,normalizePolicy,loadTaxPolicy,parse}
