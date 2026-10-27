// Branch-owned inventory master records. Stock movements MUST go through the
// existing batch receipt / manual-stock-out engine; an item edit never updates stock.
const db = require('../db/connect')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const { writeAuditLog } = require('../utils/audit')
const { nextInventoryBarcode } = require('../utils/barcodes')
const { receiveInventoryBatch, syncInventorySnapshot, attachBatchesToInventory } = require('../utils/inventoryBatches')
const { resolveMainStockroom } = require('../utils/inventoryLocations')

const fail = (status, code, message) => Object.assign(new Error(message), { statusCode:status, code })
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value)>0
const oneOf = (value, allowed) => allowed.includes(value)
const clean = (v,n=150) => String(v??'').trim().slice(0,n)
const number = (v,key,{min=0,max=1e9}={}) => {
  if(v===null || v===undefined || v==='')throw fail(400,'MISSING_FIELD',`${key} is required.`)
  const x=Number(v)
  if(!Number.isFinite(x)||x<min||x>max)throw fail(400,'INVALID_FIELD',`${key} must be between ${min} and ${max}.`)
  return x
}
const normalize = body => {
  const p={
    name:clean(body.name),category:clean(body.category,20),item_type:clean(body.item_type,20),
    barcode:clean(body.barcode,50)||null,dosage_form:clean(body.dosage_form,80)||null,
    strength:clean(body.strength,80)||null,measurement_value:body.measurement_value==null||body.measurement_value===''?null:number(body.measurement_value,'Measurement', {min:0}),
    measurement_unit:clean(body.measurement_unit,30)||null,
    location_type_id:Number(body.location_type_id),supplier_id:body.supplier_id?Number(body.supplier_id):null,
    threshold:number(body.threshold,'Low Stock Alert'),
    selling_price:number(body.selling_price??body.price,'Selling Price',{min:0.01,max:99999999}),
  }
  if(!p.name||p.name.length>150||!oneOf(p.category,['medical','derma'])||!oneOf(p.item_type,['medicine','supplies']))throw fail(400,'INVALID_ITEM','Enter a name, clinic category and item type.')
  if(!positiveId(p.location_type_id))throw fail(400,'INVALID_LOCATION_TYPE','Select an active storage location type.')
  if(p.supplier_id!==null && !positiveId(p.supplier_id))throw fail(400,'INVALID_SUPPLIER','Select a valid supplier.')
  return p
}
const audit = (req,conn,action,id,before,after) => writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action,entityType:'inventory_item',entityId:id,branchId:req.branchId,oldValues:before,newValues:after,ipAddress:req.ip},conn)
const errorResponse=(error,res)=> {
  if(error.statusCode)return res.status(error.statusCode).json({message:error.message,code:error.code})
  if(error.code==='ER_DUP_ENTRY')return res.status(409).json({code:'INVENTORY_DUPLICATE',message:'This barcode or item already exists in your branch.'})
  throw error
}
async function validateReferences(conn, branchId, p){
  const [[locationType]]=await conn.query('SELECT id FROM inventory_location_types WHERE id=? AND branch_id=? AND is_active=1',[p.location_type_id,branchId])
  if(!locationType)throw fail(400,'INVALID_LOCATION_TYPE','Storage location type does not exist in this branch.')
  let supplier=null
  if(p.supplier_id){
    ;[[supplier]]=await conn.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND branch_id=? AND is_active=1',[p.supplier_id,branchId])
    if(!supplier||!supplier.category.split(',').map(s=>s.trim()).includes(p.category))throw fail(400,'INVALID_SUPPLIER','Supplier is not active for this clinic and branch.')
  }
  return supplier
}
const returnItem=async(id,branchId)=>{
  const [rows]=await db.query('SELECT * FROM inventory WHERE id=? AND branch_id=?',[id,branchId])
  const enriched=await attachBatchesToInventory(rows,db)
  return enriched[0]
}
async function createItem(req,res){
  // New items are Medicine only. Historical Supplies remain editable through updateItem.
  if (String(req.body?.item_type || '') !== 'medicine') {
    return res.status(400).json({code:'MEDICINE_ONLY_CREATION',message:'New inventory items must be Medicine. Existing supplies can still be managed.'})
  }
  let conn
  try{
    const p=normalize(req.body||{})
    const qty=number(req.body.stock,'Opening Quantity',{min:0})
    if(!Number.isInteger(qty))throw fail(400,'INVALID_QUANTITY','Opening quantity must be a whole number.')
    const expiry=clean(req.body.expiration_date,10)
    if(qty>0 && p.item_type==='medicine'&&!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw fail(400,'INVALID_EXPIRY','Opening stock for medicine requires a YYYY-MM-DD expiry.')
    if(qty>0 && p.item_type==='supplies'&&!expiry&&!req.body.no_expiry)throw fail(400,'INVALID_EXPIRY','Choose an expiry or No expiry for supplies.')
    conn=await db.getConnection();await conn.beginTransaction()
    const supplier=await validateReferences(conn,req.branchId,p)
    const barcode=p.barcode||await nextInventoryBarcode(p.category,req.branchId,conn)
    const [[same]]=await conn.query('SELECT id FROM inventory WHERE branch_id=? AND (barcode=? OR LOWER(TRIM(name))=LOWER(?)) LIMIT 1',[req.branchId,barcode,p.name])
    if(same)throw fail(409,'INVENTORY_DUPLICATE','An item with this barcode or name already exists in this branch.')
    const [result]=await conn.query(`INSERT INTO inventory
      (branch_id,barcode,name,category,item_type,uom,dosage_form,strength,measurement_value,measurement_unit,unit,base_unit,unit_size,stock,stock_base,threshold,price,selling_price,supplier,supplier_id,location_type_id)
      VALUES (?,?,?,?,?,'unit',?,?,?,?,'unit','unit',1,0,0,?,?,?,?,?,?)`,
      [req.branchId,barcode,p.name,p.category,p.item_type,p.dosage_form,p.strength,p.measurement_value,p.measurement_unit,p.threshold,p.selling_price,p.selling_price,supplier?.name||null,p.supplier_id,p.location_type_id])
    let received=null
    if(qty>0){
      const main=await resolveMainStockroom(conn,{branchId:req.branchId})
      if(!main)throw fail(409,'NO_STOCKROOM','This branch needs an active Main Stockroom.')
      if(!supplier)throw fail(400,'SUPPLIER_REQUIRED','Select an active supplier for opening stock.')
      received=await receiveInventoryBatch(result.insertId,{quantity:qty,expiration_date:expiry||null,supplier_id:p.supplier_id,
        supplier_lot_number:clean(req.body.supplier_lot_number,120)||null,
        unit_cost:number(req.body.unit_cost??0,'Unit Cost'),location_id:main.id,note:'Opening stock'},conn)
      await syncInventorySnapshot(result.insertId,conn)
      await conn.query(`INSERT INTO inventory_logs (inventory_id,admin_id,type,qty,note,movement_type,batch_id,to_location,branch_id)
        VALUES (?,?,'in',?,'Opening stock','received',?,?,?)`,[result.insertId,req.user.id,qty,received.batch_id,received.location,req.branchId])
    }
    await audit(req,conn,'inventory.item_created',result.insertId,null,{...p,barcode,opening_quantity:qty,opening_batch_id:received?.batch_id||null})
    await conn.commit();conn.release();conn=null
    return res.status(201).json(await returnItem(result.insertId,req.branchId))
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}
async function updateItem(req,res){
  let conn
  try{
    if(!positiveId(req.params.id))throw fail(400,'INVALID_ID','Invalid item ID.')
    const p=normalize(req.body||{})
    if(Object.hasOwn(req.body,'stock')||Object.hasOwn(req.body,'stock_base'))throw fail(400,'STOCK_EDIT_DENIED','Use Stock In or Stock Out to change quantities.')
    conn=await db.getConnection();await conn.beginTransaction()
    const [[prior]]=await conn.query('SELECT * FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[req.params.id,req.branchId])
    if(!prior)throw fail(404,'INVENTORY_NOT_FOUND','Item not found in this branch.')
    if(prior.archived_at)throw fail(409,'INVENTORY_ARCHIVED','Archived items cannot be edited.')
    const supplier=await validateReferences(conn,req.branchId,p)
    if(Number(prior.selling_price)!==Number(p.selling_price)){
      const [[linked]]=await conn.query('SELECT COUNT(*) AS n FROM billing_service_materials WHERE inventory_id=?',[prior.id])
      if(Number(linked.n)>0)throw fail(409,'LINKED_SERVICE_REPRICING','This item is linked to billable services. Change linked pricing using the audited service-pricing workflow.')
    }
    const barcode=p.barcode||prior.barcode
    const [[same]]=await conn.query('SELECT id FROM inventory WHERE branch_id=? AND id<>? AND (barcode=? OR LOWER(TRIM(name))=LOWER(?)) LIMIT 1',[req.branchId,prior.id,barcode,p.name])
    if(same)throw fail(409,'INVENTORY_DUPLICATE','Another item has this barcode or name in your branch.')
    await conn.query(`UPDATE inventory SET barcode=?,name=?,category=?,item_type=?,dosage_form=?,strength=?,measurement_value=?,measurement_unit=?,threshold=?,price=?,selling_price=?,supplier=?,supplier_id=?,location_type_id=? WHERE id=? AND branch_id=?`,
    [barcode,p.name,p.category,p.item_type,p.dosage_form,p.strength,p.measurement_value,p.measurement_unit,p.threshold,p.selling_price,p.selling_price,supplier?.name||null,p.supplier_id,p.location_type_id,prior.id,req.branchId])
    await audit(req,conn,'inventory.item_updated',prior.id,prior,{...p,barcode})
    await conn.commit();conn.release();conn=null
    return res.json(await returnItem(prior.id,req.branchId))
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}
async function archiveItem(req,res){
  let conn
  try{
    if(!positiveId(req.params.id))throw fail(400,'INVALID_ID','Invalid item ID.')
    conn=await db.getConnection();await conn.beginTransaction()
    const [[prior]]=await conn.query('SELECT id,name,stock,archived_at FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[req.params.id,req.branchId])
    if(!prior)throw fail(404,'INVENTORY_NOT_FOUND','Item not found in this branch.')
    if(prior.archived_at)throw fail(409,'INVENTORY_ARCHIVED','Item is already archived.')
    if(Number(prior.stock)>0)throw fail(409,'INVENTORY_STOCK_REMAINS','Use a documented stock-out before archiving an item with stock.')
    const reason=clean(req.body?.reason,255)||'Archived by branch administrator'
    await conn.query('UPDATE inventory SET archived_at=NOW(),archived_by_admin_id=?,archive_reason=? WHERE id=? AND branch_id=?',[req.user.id,reason,prior.id,req.branchId])
    await audit(req,conn,'inventory.item_archived',prior.id,prior,{archived:true,reason})
    await conn.commit();conn.release();conn=null
    return res.json({archived:true,message:'Item archived. Historical inventory activity remains available.'})
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}
function registerBranchInventoryItems(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('inventory')]
  router.post(`${prefix}/inventory`,...guard,afterSuccessfulMutation('inventory.updated'),createItem)
  router.put(`${prefix}/inventory/:id`,...guard,afterSuccessfulMutation('inventory.updated'),updateItem)
  router.delete(`${prefix}/inventory/:id`,...guard,afterSuccessfulMutation('inventory.updated'),archiveItem)
 }
}
module.exports={registerBranchInventoryItems,createItem,updateItem,archiveItem}


