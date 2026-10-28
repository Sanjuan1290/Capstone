// Super Admin only. Read-only cross-branch inventory summaries.
const db = require('../db/connect')
const { getTodayDateOnly, addDaysDateOnly } = require('../utils/date')
const safeId = value => Number.isSafeInteger(Number(value)) && Number(value)>0
const stockOf = i => Number(i.stock_base ?? i.stock ?? 0)
const keyOf = item => [item.name,item.strength,item.dosage_form,item.measurement_value,item.measurement_unit,item.base_unit,item.category]
  .map(v=>String(v??'').trim().toLowerCase()).join('\u001f')
const statusOf = item => {
  const quantity=stockOf(item),threshold=Number(item.threshold||0),today=getTodayDateOnly()
  const expired=item.nearest_expiry && String(item.nearest_expiry).slice(0,10)<today
  return {out:quantity<=0,low:quantity>0&&quantity<=threshold,expired:Boolean(expired)}
}
const positiveInt = (raw,fallback,max) => Number.isSafeInteger(Number(raw)) && Number(raw)>0 ? Math.min(Number(raw),max) : fallback
const validEnum = (value,list) => list.includes(String(value||''))?String(value):null
function registerAllInventory(router,requireSuper) {
  router.get('/inventory/all',requireSuper,async(req,res)=>{
    const view=validEnum(req.query.view,['combined','by_branch'])||'combined'
    const category=validEnum(req.query.category,['medical','derma'])
    const itemType=validEnum(req.query.item_type,['medicine','supplies'])
    const status=validEnum(req.query.status,['in_stock','low','out','expiring','expired'])
    const includeArchived=req.query.include_archived==='true'
    const days=positiveInt(req.query.expiry_days,30,365)
    const page=positiveInt(req.query.page,1,100000)
    const limit=positiveInt(req.query.limit,25,200)
    const search=String(req.query.search||'').trim().slice(0,120).toLowerCase()
    const selected=String(req.query.branch_ids||'').split(',').filter(Boolean).map(Number)
    if(selected.length>100 || selected.some(v=>!safeId(v)))return res.status(400).json({message:'Invalid branch IDs.'})
    const [branches]=await db.query(`SELECT id,name,code,is_active FROM clinic_branches WHERE ${selected.length?'id IN ('+selected.map(()=>'?').join(',')+')':'is_active=1'} ORDER BY name`,selected)
    if(selected.length && branches.length!==new Set(selected).size)return res.status(400).json({message:'One or more branches do not exist.'})
    if(!branches.length)return res.json({view,page,limit,total:0,rows:[],summary:{total_items:0,out_of_stock:0,low_stock:0,expiring_30_days:0,expired:0,total_stock_value:0},branches:[],comparison:[]})
    const ids=branches.map(b=>b.id)
    const conditions=[`i.branch_id IN (${ids.map(()=>'?').join(',')})`]
    const args=[...ids]
    if(!includeArchived)conditions.push('i.archived_at IS NULL')
    if(category){conditions.push('i.category=?');args.push(category)}
    if(itemType){conditions.push('i.item_type=?');args.push(itemType)}
    if(search){conditions.push('LOWER(CONCAT_WS(\' \',i.name,i.barcode,i.strength,i.dosage_form)) LIKE ?');args.push(`%${search}%`)}
    const [items]=await db.query(`SELECT i.*,b.name AS branch_name,b.code AS branch_code,
       (SELECT MIN(batch.expiration_date) FROM inventory_batches batch WHERE batch.inventory_id=i.id
        AND batch.branch_id=i.branch_id AND batch.quantity>0 AND batch.archived_at IS NULL) AS nearest_expiry,
       (SELECT COALESCE(SUM(batch.quantity*batch.unit_cost),0) FROM inventory_batches batch
        WHERE batch.inventory_id=i.id AND batch.branch_id=i.branch_id AND batch.quantity>0 AND batch.archived_at IS NULL) AS cost_value
      FROM inventory i JOIN clinic_branches b ON b.id=i.branch_id
      WHERE ${conditions.join(' AND ')} ORDER BY i.name,i.branch_id,i.id`,args)
    const byBranch=items.map(i=>({ ...i,quantity_base:stockOf(i),cost_value:Number(i.cost_value||0),selling_value:Number(i.stock||0)*Number(i.selling_price||0),...statusOf(i)}))
    const today=getTodayDateOnly(),expiryCutoff=addDaysDateOnly(today,days)
    const filtered=byBranch.filter(i=>{
      if(!status)return true
      if(status==='out')return i.out
      if(status==='low')return i.low
      if(status==='in_stock')return !i.low&&!i.out
      if(status==='expired')return i.expired
      return i.nearest_expiry && String(i.nearest_expiry).slice(0,10)>=today && String(i.nearest_expiry).slice(0,10)<=expiryCutoff
    })
    const grouped=new Map()
    for(const i of filtered){
      const key=keyOf(i)
      if(!grouped.has(key))grouped.set(key,{key,name:i.name,category:i.category,item_type:i.item_type,strength:i.strength,dosage_form:i.dosage_form,measurement_value:i.measurement_value,measurement_unit:i.measurement_unit,base_unit:i.base_unit,quantity_base:0,cost_value:0,selling_value:0,branches_below_threshold:[],nearest_expiry:null,nearest_expiry_branch:null,per_branch:[],inventory_ids:[]})
      const g=grouped.get(key)
      g.quantity_base+=i.quantity_base;g.cost_value+=i.cost_value;g.selling_value+=i.selling_value
      g.per_branch.push({branch_id:i.branch_id,branch_name:i.branch_name,inventory_id:i.id,quantity_base:i.quantity_base,threshold:Number(i.threshold||0),cost_value:i.cost_value,nearest_expiry:i.nearest_expiry})
      g.inventory_ids.push(i.id)
      if(i.low||i.out)g.branches_below_threshold.push(i.branch_name)
      if(i.nearest_expiry&&(!g.nearest_expiry||String(i.nearest_expiry)<String(g.nearest_expiry))){g.nearest_expiry=i.nearest_expiry;g.nearest_expiry_branch=i.branch_name}
    }
    const summary={total_items:filtered.length,out_of_stock:filtered.filter(i=>i.out).length,low_stock:filtered.filter(i=>i.low).length,expired:filtered.filter(i=>i.expired).length,
      expiring_30_days:filtered.filter(i=>i.nearest_expiry&&String(i.nearest_expiry).slice(0,10)<=addDaysDateOnly(today,30)&&!i.expired).length,
      total_stock_value:filtered.reduce((sum,i)=>sum+i.cost_value,0)}
    const comparison=branches.map(b=>{const rows=filtered.filter(i=>Number(i.branch_id)===Number(b.id));return {branch_id:b.id,branch_name:b.name,item_count:rows.length,quantity_base:rows.reduce((s,i)=>s+i.quantity_base,0),low_stock:rows.filter(i=>i.low).length,cost_value:rows.reduce((s,i)=>s+i.cost_value,0)}})
    const result=view==='combined'?[...grouped.values()]:filtered
    const sort=validEnum(req.query.sort,['name','quantity','cost','expiry'])||'name'
    result.sort((a,b)=>sort==='quantity'?b.quantity_base-a.quantity_base:sort==='cost'?b.cost_value-a.cost_value:sort==='expiry'?String(a.nearest_expiry||'9999').localeCompare(String(b.nearest_expiry||'9999')):String(a.name).localeCompare(String(b.name)))
    res.json({view,page,limit,total:result.length,rows:result.slice((page-1)*limit,page*limit),summary,branches,comparison})
  })
  router.get('/inventory/all/batches',requireSuper,async(req,res)=>{
    const ids=String(req.query.item_ids||'').split(',').filter(Boolean).map(Number)
    if(!ids.length||ids.length>100||ids.some(v=>!safeId(v)))return res.status(400).json({message:'Select valid inventory IDs.'})
    const [rows]=await db.query(`SELECT batch.id,batch.inventory_id,batch.batch_code,batch.supplier_lot_number AS lot,
      batch.expiration_date,batch.quantity,batch.unit_cost,b.name AS branch_name,b.id AS branch_id,
      location.name AS location_name,locationBatch.quantity AS location_quantity
      FROM inventory_batches batch JOIN inventory i ON i.id=batch.inventory_id AND i.branch_id=batch.branch_id
      JOIN clinic_branches b ON b.id=i.branch_id
      LEFT JOIN inventory_location_batches locationBatch ON locationBatch.batch_id=batch.id AND locationBatch.inventory_id=i.id
      LEFT JOIN inventory_locations location ON location.id=locationBatch.location_id AND location.branch_id=i.branch_id
      WHERE i.id IN (${ids.map(()=>'?').join(',')}) AND batch.archived_at IS NULL
      ORDER BY b.name,batch.expiration_date,batch.id`,ids)
    res.json(rows)
  })
}
module.exports={registerAllInventory,keyOf}


