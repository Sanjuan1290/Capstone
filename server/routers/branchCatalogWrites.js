// Per-branch service catalog and discount presets. All reference IDs are resolved
// within the same transaction as the mutation; no cross-branch materials allowed.
const db=require('../db/connect')
const {writeAuditLog}=require('../utils/audit')
const {normalizeServiceMaterials}=require('../utils/billing')
const {validateAverageDurationMinutes}=require('../utils/bookingPolicy')
const err=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const number=(value,{min=0,max=100000000}={})=>Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):null
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
const audit=(req,conn,action,type,id,oldValues,newValues)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action,entityType:type,entityId:id,branchId:req.branchId,oldValues,newValues,ipAddress:req.ip},conn)
async function run(req,res,action){
 let conn
 try{
  conn=await db.getConnection();await conn.beginTransaction()
  const result=await action(conn)
  await conn.commit();conn.release();conn=null
  return res.status(result.status||200).json(result.body)
 }catch(error){if(conn){await conn.rollback();conn.release()}
   if(error.statusCode)return res.status(error.statusCode).json({code:error.code,message:error.message})
   if(error.code==='ER_DUP_ENTRY')return res.status(409).json({code:'DUPLICATE',message:'This name is already in use in this branch.'})
   throw error
 }
}
const normalizeService=body=>{
 const p={service_name:String(body.service_name||'').trim().slice(0,180),clinic_type:String(body.clinic_type||''),category_id:Number(body.category_id),
  consultation_fee:number(body.consultation_fee??body.base_service_price,{min:0.01,max:99999999}),
  average_duration_minutes:validateAverageDurationMinutes(body.average_duration_minutes,{fallback:60}),
  sort_order:Number(body.sort_order||0),is_active:body.is_active===false||body.is_active===0?0:1,
  pricing_notes:String(body.pricing_notes||'').trim().slice(0,255)||null,
  materials:normalizeServiceMaterials(body.materials||[])}
 if(!p.service_name||!['medical','derma'].includes(p.clinic_type)||!validId(p.category_id)||p.consultation_fee===null||!Number.isInteger(p.sort_order))throw err(400,'INVALID_SERVICE','Enter a valid service name, clinic, category, service price and sort order.')
 if(!Array.isArray(body.materials))throw err(400,'MATERIALS_REQUIRED','Include the complete consumables list (or an empty list) when saving a service.')
 if(p.materials.length!==body.materials.length)throw err(400,'INVALID_MATERIALS','A consumable has an invalid name or quantity.')
 return p
}
async function verifyService(conn,branchId,id){
 const [[row]]=await conn.query('SELECT * FROM billing_service_catalog WHERE id=? AND branch_id=? FOR UPDATE',[id,branchId])
 if(!row)throw err(404,'SERVICE_NOT_FOUND','Service not found in this branch.')
 return row
}
async function validatePricing(conn,branchId,p){
 const [[category]]=await conn.query('SELECT id,name,is_active FROM billing_service_categories WHERE id=? AND branch_id=? AND clinic_type=?',[p.category_id,branchId,p.clinic_type])
 if(!category || !Number(category.is_active))throw err(400,'INVALID_CATEGORY','Choose an active category in this branch.')
 let total=Number(p.consultation_fee)
 for(const [index,m] of p.materials.entries()){
  if(!validId(m.inventory_id)||!Number.isInteger(Number(m.quantity))||Number(m.quantity)<=0)throw err(400,'INVALID_CONSUMABLE',`Consumable ${index+1} requires an inventory item and whole-number quantity.`)
  const [[item]]=await conn.query('SELECT id,name,category,selling_price,archived_at FROM inventory WHERE id=? AND branch_id=?',[m.inventory_id,branchId])
  if(!item||item.archived_at||item.category!==p.clinic_type)throw err(404,'INVENTORY_NOT_FOUND',`Consumable ${index+1} is unavailable in this branch.`)
  if(!(Number(item.selling_price)>0))throw err(409,'CONSUMABLE_PRICE_REQUIRED',`Set a selling price for ${item.name} first.`)
  total+=Number(item.selling_price)*Number(m.quantity)
 }
 return {category,total:Math.round(total*100)/100}
}
async function saveService(req,res){
 return run(req,res,async conn=>{
  const p=normalizeService(req.body||{}),id=req.params.serviceId?Number(req.params.serviceId):0
  if(id&&!validId(id))throw err(400,'INVALID_ID','Invalid service ID.')
  const before=id?await verifyService(conn,req.branchId,id):null
  if(before?.category_id && Number(before.category_id)!==p.category_id){/* category remains in same branch, verified below */}
  const {category,total}=await validatePricing(conn,req.branchId,p)
  const args=[p.category_id,category.name,p.service_name,p.clinic_type,total,p.consultation_fee,p.average_duration_minutes,0,p.is_active,p.sort_order,p.pricing_notes]
  let serviceId=id
  if(id){await conn.query(`UPDATE billing_service_catalog SET category_id=?,category=?,service_name=?,clinic_type=?,default_price=?,consultation_fee=?,average_duration_minutes=?,profit_percentage=?,is_active=?,sort_order=?,pricing_notes=? WHERE id=? AND branch_id=?`,[...args,id,req.branchId])}
  else{
   const [r]=await conn.query(`INSERT INTO billing_service_catalog (category_id,category,service_name,clinic_type,default_price,consultation_fee,average_duration_minutes,profit_percentage,is_active,sort_order,pricing_notes,branch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[...args,req.branchId]);serviceId=r.insertId
  }
  await conn.query(`DELETE m FROM billing_service_materials m JOIN billing_service_catalog s ON s.id=m.billing_service_id WHERE m.billing_service_id=? AND s.branch_id=?`,[serviceId,req.branchId])
  for(const m of p.materials)await conn.query(`INSERT INTO billing_service_materials (billing_service_id,inventory_id,material_name,quantity,unit_label,unit_cost_override,notes,sort_order) VALUES (?,?,?,?,?,?,?,?)`,[serviceId,m.inventory_id,m.material_name,m.quantity,m.unit_label,m.unit_cost_override,m.notes,m.sort_order])
  await audit(req,conn,id?'catalog.service_updated':'catalog.service_created','billing_service',serviceId,before,{...p,default_price:total})
  // getBillingCatalogServiceById queries the global catalog by stable unique id;
  // ensure the branch-owned write and audit committed before external hydration.
  return {status:id?200:201,body:{id:serviceId,...p,category:category.name,default_price:total,patient_price:total,materials:p.materials}}
 })
}
async function deleteService(req,res){
 return run(req,res,async conn=>{
  const before=await verifyService(conn,req.branchId,req.params.serviceId)
  const [[used]]=await conn.query('SELECT COUNT(*) AS total FROM billing_items WHERE catalog_service_id=?',[before.id])
  if(Number(used.total)>0){
   await conn.query('UPDATE billing_service_catalog SET is_active=0 WHERE id=? AND branch_id=?',[before.id,req.branchId])
   await audit(req,conn,'catalog.service_archived','billing_service',before.id,before,{is_active:0})
   return {body:{archived:true,message:'Service archived; historical bills preserved.'}}
  }
  await conn.query('DELETE FROM billing_service_materials WHERE billing_service_id=?',[before.id])
  await conn.query('DELETE FROM billing_service_catalog WHERE id=? AND branch_id=?',[before.id,req.branchId])
  await audit(req,conn,'catalog.service_deleted','billing_service',before.id,before,null)
  return {body:{archived:false,message:'Service deleted.'}}
 })
}
async function saveDiscount(req,res){
 return run(req,res,async conn=>{
  const id=req.params.id?Number(req.params.id):0
  if(id&&!validId(id))throw err(400,'INVALID_ID','Invalid discount ID.')
  const p={label:String(req.body.label||'').trim().slice(0,120),discount_type:req.body.discount_type,
   value:number(req.body.value,{min:0,max:99999999}),requires_reference:req.body.requires_reference?1:0,
   requires_admin_approval:req.body.requires_admin_approval?1:0,is_active:req.body.is_active===false||req.body.is_active===0?0:1}
  if(!p.label||!['percentage','fixed'].includes(p.discount_type)||p.value===null||(p.discount_type==='percentage'&&p.value>100))throw err(400,'INVALID_DISCOUNT','Enter a valid label, discount type and value.')
  const [[prior]]=id?await conn.query('SELECT * FROM discount_presets WHERE id=? AND branch_id=? FOR UPDATE',[id,req.branchId]):[[]]
  if(id&&!prior)throw err(404,'DISCOUNT_NOT_FOUND','Discount not found in this branch.')
  if(id&&!p.is_active){const [[pending]]=await conn.query(`SELECT COUNT(*) AS total FROM billing_adjustment_requests WHERE discount_preset_id=? AND status='pending'`,[id]);if(Number(pending.total)>0)throw err(409,'PENDING_DISCOUNTS','Resolve pending adjustments before deactivating the discount.')}
  const values=[p.label,p.discount_type,p.value,p.requires_reference,p.requires_admin_approval,p.is_active]
  let targetId=id
  if(id)await conn.query('UPDATE discount_presets SET label=?,discount_type=?,value=?,requires_reference=?,requires_admin_approval=?,is_active=? WHERE id=? AND branch_id=?',[...values,id,req.branchId])
  else{const [r]=await conn.query('INSERT INTO discount_presets (label,discount_type,value,requires_reference,requires_admin_approval,is_active,branch_id) VALUES (?,?,?,?,?,?,?)',[...values,req.branchId]);targetId=r.insertId}
  await audit(req,conn,id?'billing.discount_preset_updated':'billing.discount_preset_created','discount_preset',targetId,prior||null,p)
  return {status:id?200:201,body:{id:targetId,...p}}
 })
}
function registerBranchCatalogWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('system_setup')]
  router.post(`${prefix}/billing/catalog`,...guard,saveService)
  router.put(`${prefix}/billing/catalog/:serviceId`,...guard,saveService)
  router.delete(`${prefix}/billing/catalog/:serviceId`,...guard,deleteService)
  router.post(`${prefix}/billing/discount-presets`,...middle,requirePermission('billing'),saveDiscount)
  router.put(`${prefix}/billing/discount-presets/:id`,...middle,requirePermission('billing'),saveDiscount)
 }
}
module.exports={registerBranchCatalogWrites,saveService,deleteService,saveDiscount}

