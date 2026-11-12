// Super Admin only. All endpoints are read-only and branch-scoped via the request's Super Admin guard.
const db = require('../db/connect')
const { getTodayDateOnly, addDaysDateOnly } = require('../utils/date')
const { dateOnly, statusFor, summaryFor } = require('../utils/allInventoryOverview')
const safeId = value => Number.isSafeInteger(Number(value)) && Number(value)>0
const stockOf = item => Number(item.stock_base ?? item.stock ?? 0)
const positiveInt = (raw,fallback,max) => Number.isSafeInteger(Number(raw)) && Number(raw)>0 ? Math.min(Number(raw),max) : fallback
const validEnum = (value,list) => list.includes(String(value||''))?String(value):null

function registerAllInventory(router,requireSuper) {
 const loadAll = async(req,res,exportMode=false)=>{
  // Every inventory row belongs to one branch. Never merge items by descriptions.
  // Legacy view=combined requests also receive branch-item records.
  const view='by_branch'
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
  // Stock alerts, totals and pagination all operate on individual inventory IDs.
  // Two records with identical names remain separate even in different branches.
  const summary=summaryFor(filtered,filtered,branches,today,cutoff30)
  const comparison=branches.map(branch=>{
   const rows=filtered.filter(item=>Number(item.branch_id)===Number(branch.id))
   return {branch_id:branch.id,branch_name:branch.name,item_count:rows.length,
    quantity_base:rows.reduce((sum,item)=>sum+item.quantity_base,0),
    low_stock:rows.filter(item=>item.low).length,out_of_stock:rows.filter(item=>item.out).length,
    expiring:rows.filter(item=>item.expiring).length,expired:rows.filter(item=>item.expired).length,
    selling_value:rows.reduce((sum,item)=>sum+item.selling_value,0)}
  })
  const sort=validEnum(req.query.sort,['name','quantity','selling_value','expiry'])||'name'
  const result=[...filtered].sort((a,b)=>{
   const comparison=sort==='quantity' ? b.quantity_base-a.quantity_base
    : sort==='selling_value' ? b.selling_value-a.selling_value
    : sort==='expiry' ? String(dateOnly(a.nearest_expiry)||'9999').localeCompare(String(dateOnly(b.nearest_expiry)||'9999'))
    : String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})
   return comparison || String(a.branch_name||'').localeCompare(String(b.branch_name||'')) || Number(a.id)-Number(b.id)
  })
  // A separate Super Admin GET export returns every matching product, regardless of
  // the UI pagination limit. Scope, status, sorting and branch restrictions are shared.
  // Limit unusually large exports instead of generating an unbounded browser workbook.
  if(exportMode && result.length>15000) {
   return res.status(413).json({message:'This export is too large. Narrow the branch, search or stock-status filter and try again.'})
  }
  res.json({view,page,limit,total:result.length,rows:exportMode?result:result.slice((page-1)*limit,page*limit),summary,branches,comparison})
 }
 router.get('/inventory/all',requireSuper,(req,res)=>loadAll(req,res))
 router.get('/inventory/all/export',requireSuper,(req,res)=>loadAll(req,res,true))
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
module.exports={registerAllInventory}
