// Super Admin only. All endpoints are read-only and branch-scoped via the request's Super Admin guard.
const db = require('../db/connect')
const { getTodayDateOnly, addDaysDateOnly } = require('../utils/date')
const { dateOnly, statusFor, summaryFor } = require('../utils/allInventoryOverview')
const safeId = value => Number.isSafeInteger(Number(value)) && Number(value)>0
const stockOf = item => Number(item.stock_base ?? item.stock ?? 0)
const keyOf = item => [item.name,item.strength,item.dosage_form,item.measurement_value,item.measurement_unit,item.base_unit,item.category,item.item_type]
  .map(v=>String(v??'').trim().toLowerCase()).join('\u001f')
const positiveInt = (raw,fallback,max) => Number.isSafeInteger(Number(raw)) && Number(raw)>0 ? Math.min(Number(raw),max) : fallback
const validEnum = (value,list) => list.includes(String(value||''))?String(value):null

function registerAllInventory(router,requireSuper) {
 router.get('/inventory/all',requireSuper,async(req,res)=>{
  const view=validEnum(req.query.view,['combined','by_branch'])||'combined'
  const category=validEnum(req.query.category,['medical','derma'])
  const itemType=validEnum(req.query.item_type,['medicine','supplies'])
  const status=validEnum(req.query.status,['in_stock','low','out','expiring','expired','alerts'])
  const includeArchived=req.query.include_archived==='true'
  const days=positiveInt(req.query.expiry_days,30,365)
  const page=positiveInt(req.query.page,1,100000)
  const limit=positiveInt(req.query.limit,25,200)
  const search=String(req.query.search||'').trim().slice(0,120).toLowerCase()
  const selected=String(req.query.branch_ids||'').split(',').filter(Boolean).map(Number)
  if(selected.length>100 || selected.some(v=>!safeId(v)))return res.status(400).json({message:'Invalid branch IDs.'})
  const [branches]=await db.query(`SELECT id,name,code,is_active FROM clinic_branches WHERE ${selected.length?'id IN ('+selected.map(()=>'?').join(',')+')':'is_active=1'} ORDER BY name`,selected)
  if(selected.length && branches.length!==new Set(selected).size)return res.status(400).json({message:'One or more branches do not exist.'})
  if(!branches.length)return res.json({view,page,limit,total:0,rows:[],summary:summaryFor([],[],[],getTodayDateOnly(),addDaysDateOnly(getTodayDateOnly(),30)),branches:[],comparison:[]})
  const ids=branches.map(b=>b.id)
  const conditions=[`i.branch_id IN (${ids.map(()=>'?').join(',')})`]
  const args=[...ids]
  if(!includeArchived)conditions.push('i.archived_at IS NULL')
  if(category){conditions.push('i.category=?');args.push(category)}
  if(itemType){conditions.push('i.item_type=?');args.push(itemType)}
  if(search){conditions.push('LOWER(CONCAT_WS(\' \',i.name,i.barcode,i.strength,i.dosage_form)) LIKE ?');args.push(`%${search}%`)}
  const [items]=await db.query(`SELECT i.*,b.name AS branch_name,b.code AS branch_code,
    (SELECT MIN(batch.expiration_date) FROM inventory_batches batch WHERE batch.inventory_id=i.id
       AND batch.branch_id=i.branch_id AND batch.quantity>0 AND batch.archived_at IS NULL) AS nearest_expiry
    FROM inventory i JOIN clinic_branches b ON b.id=i.branch_id
    WHERE ${conditions.join(' AND ')} ORDER BY i.name,i.branch_id,i.id`,args)
  const today=getTodayDateOnly(),expiryCutoff=addDaysDateOnly(today,days),cutoff30=addDaysDateOnly(today,30)
  const byBranch=items.map(i=>{
   const quantity_base=stockOf(i)
   return {...i,quantity_base,
    selling_value:Number(i.stock??quantity_base)*Number(i.selling_price||0),
    ...statusFor({...i,quantity_base},today,expiryCutoff)}
  })
  const filtered=byBranch.filter(i=>{
   if(!status)return true
   if(status==='alerts')return i.out||i.low||i.expired||i.expiring
   if(status==='out')return i.out
   if(status==='low')return i.low
   if(status==='in_stock')return !i.low&&!i.out&&!i.expired&&!i.expiring
   if(status==='expired')return i.expired
   return i.expiring
  })
  const grouped=new Map()
  for(const i of filtered){
   const key=keyOf(i)
   if(!grouped.has(key))grouped.set(key,{
    key,name:i.name,category:i.category,item_type:i.item_type,strength:i.strength,dosage_form:i.dosage_form,
    measurement_value:i.measurement_value,measurement_unit:i.measurement_unit,base_unit:i.base_unit,
    quantity_base:0,selling_value:0,branches_below_threshold:[],nearest_expiry:null,
    nearest_expiry_branch:null,per_branch:[],inventory_ids:[],
    low:false,out:false,expired:false,expiring:false,archived_count:0,branch_coverage:0,
   })
   const g=grouped.get(key)
   g.quantity_base+=i.quantity_base;g.selling_value+=i.selling_value
   g.per_branch.push({branch_id:i.branch_id,branch_name:i.branch_name,inventory_id:i.id,quantity_base:i.quantity_base,
    threshold:Number(i.threshold||0),selling_value:i.selling_value,nearest_expiry:i.nearest_expiry,
    low:i.low,out:i.out,expired:i.expired,expiring:i.expiring})
   g.inventory_ids.push(i.id)
   if(i.low||i.out)g.branches_below_threshold.push(i.branch_name)
   for(const k of ['low','out','expired','expiring'])if(i[k])g[k]=true
   if(i.archived_at)g.archived_count++
   if(i.quantity_base>0)g.branch_coverage++
   if(i.nearest_expiry&&(!g.nearest_expiry||dateOnly(i.nearest_expiry)<dateOnly(g.nearest_expiry))){g.nearest_expiry=i.nearest_expiry;g.nearest_expiry_branch=i.branch_name}
  }
  const groupRows=[...grouped.values()]
  const summary=summaryFor(filtered,groupRows,branches,today,cutoff30)
  const comparison=branches.map(b=>{
   const rows=filtered.filter(i=>Number(i.branch_id)===Number(b.id))
   return {branch_id:b.id,branch_name:b.name,item_count:rows.length,quantity_base:rows.reduce((s,i)=>s+i.quantity_base,0),
    low_stock:rows.filter(i=>i.low).length,out_of_stock:rows.filter(i=>i.out).length,
    expiring:rows.filter(i=>i.expiring).length,expired:rows.filter(i=>i.expired).length,
    selling_value:rows.reduce((s,i)=>s+i.selling_value,0)}
  })
  const result=view==='combined'?groupRows:filtered
  const sort=validEnum(req.query.sort,['name','quantity','selling_value','expiry'])||'name'
  result.sort((a,b)=>sort==='quantity'?b.quantity_base-a.quantity_base:sort==='selling_value'?b.selling_value-a.selling_value:sort==='expiry'?String(dateOnly(a.nearest_expiry)||'9999').localeCompare(String(dateOnly(b.nearest_expiry)||'9999')):String(a.name).localeCompare(String(b.name)))
  res.json({view,page,limit,total:result.length,rows:result.slice((page-1)*limit,page*limit),summary,branches,comparison})
 })
 router.get('/inventory/all/batches',requireSuper,async(req,res)=>{
  const ids=String(req.query.item_ids||'').split(',').filter(Boolean).map(Number)
  if(!ids.length||ids.length>100||ids.some(v=>!safeId(v)))return res.status(400).json({message:'Select valid inventory IDs.'})
  const [rows]=await db.query(`SELECT batch.id,batch.inventory_id,batch.batch_code,batch.supplier_lot_number AS lot,
    batch.expiration_date,batch.quantity,b.name AS branch_name,b.id AS branch_id,
    location.name AS location_name,locationBatch.quantity AS location_quantity
    FROM inventory_batches batch JOIN inventory i ON i.id=batch.inventory_id AND i.branch_id=batch.branch_id
    JOIN clinic_branches b ON b.id=i.branch_id
    LEFT JOIN inventory_location_batches locationBatch ON locationBatch.batch_id=batch.id AND locationBatch.inventory_id=i.id
    LEFT JOIN inventory_locations location ON location.id=locationBatch.location_id AND location.branch_id=i.branch_id
    WHERE i.id IN (${ids.map(()=>'?').join(',')}) AND batch.archived_at IS NULL AND batch.quantity>0
    ORDER BY b.name,batch.expiration_date,batch.id`,ids)
  res.json(rows)
 })
}
module.exports={registerAllInventory,keyOf}
