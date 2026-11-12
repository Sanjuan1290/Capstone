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
    default_location_id:Number(body.default_location_id),supplier_id:body.supplier_id?Number(body.supplier_id):null,
    threshold:number(body.threshold,'Low Stock Alert'),
    selling_price:number(body.selling_price??body.price,'Selling Price',{min:0.01,max:99999999}),
  }
  if(!p.name||p.name.length>150||!oneOf(p.category,['medical','derma'])||!oneOf(p.item_type,['medicine','supplies']))throw fail(400,'INVALID_ITEM','Enter a name, clinic category and item type.')
  if(!positiveId(p.default_location_id))throw fail(400,'INVALID_STOCK_ROOM','Select an active Stock Room.')
  if(p.supplier_id!==null && !positiveId(p.supplier_id))throw fail(400,'INVALID_SUPPLIER','Select a valid supplier.')
  return p
}
const audit = (req,conn,action,id,before,after) => writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action,entityType:'inventory_item',entityId:id,branchId:req.branchId,oldValues:before,newValues:after,ipAddress:req.ip},conn)
const errorResponse=(error,res)=> {
  if(error.statusCode)return res.status(error.statusCode).json({message:error.message,code:error.code,details:error.details||null})
  if(error.code==='ER_DUP_ENTRY')return res.status(409).json({code:'INVENTORY_DUPLICATE',message:'This barcode or item already exists in your branch.'})
  throw error
}
async function validateReferences(conn, branchId, p){
  const [[stockRoom]]=await conn.query('SELECT id FROM inventory_locations WHERE id=? AND branch_id=? AND is_active=1',[p.default_location_id,branchId])
  if(!stockRoom)throw fail(400,'INVALID_STOCK_ROOM','Stock Room is not active or belongs to another branch.')
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
    const [[same]]=await conn.query('SELECT id,archived_at FROM inventory WHERE branch_id=? AND (barcode=? OR LOWER(TRIM(name))=LOWER(?)) LIMIT 1',[req.branchId,barcode,p.name])
    if(same)throw fail(409,same.archived_at?'INVENTORY_ARCHIVED':'INVENTORY_DUPLICATE',same.archived_at?'This item is archived. Open Archived Items and select Restore instead of creating a duplicate.':'An item with this barcode or name already exists in this branch.')
    const [result]=await conn.query(`INSERT INTO inventory
      (branch_id,barcode,name,category,item_type,uom,dosage_form,strength,measurement_value,measurement_unit,unit,base_unit,unit_size,stock,stock_base,threshold,price,selling_price,supplier,supplier_id,default_location_id)
      VALUES (?,?,?,?,?,'unit',?,?,?,?,'unit','unit',1,0,0,?,?,?,?,?,?)`,
      [req.branchId,barcode,p.name,p.category,p.item_type,p.dosage_form,p.strength,p.measurement_value,p.measurement_unit,p.threshold,p.selling_price,p.selling_price,supplier?.name||null,p.supplier_id,p.default_location_id])
    let received=null
    if(qty>0){
      const [[room]]=await conn.query('SELECT id,name FROM inventory_locations WHERE id=? AND branch_id=? AND is_active=1',[p.default_location_id,req.branchId])
      if(!room)throw fail(409,'NO_STOCKROOM','Select an active Stock Room.')
      if(!supplier)throw fail(400,'SUPPLIER_REQUIRED','Select an active supplier for opening stock.')
      received=await receiveInventoryBatch(result.insertId,{quantity:qty,expiration_date:expiry||null,supplier_id:p.supplier_id,
        supplier_lot_number:clean(req.body.supplier_lot_number,120)||null,
        unit_cost:number(req.body.unit_cost??0,'Unit Cost'),location_id:room.id,note:'Opening stock'},conn)
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
    await conn.query(`UPDATE inventory SET barcode=?,name=?,category=?,item_type=?,dosage_form=?,strength=?,measurement_value=?,measurement_unit=?,threshold=?,price=?,selling_price=?,supplier=?,supplier_id=?,default_location_id=? WHERE id=? AND branch_id=?`,
    [barcode,p.name,p.category,p.item_type,p.dosage_form,p.strength,p.measurement_value,p.measurement_unit,p.threshold,p.selling_price,p.selling_price,supplier?.name||null,p.supplier_id,p.default_location_id,prior.id,req.branchId])
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
    if(Number(prior.stock)>0)throw fail(409,'INVENTORY_STOCK_REMAINS','Stock must be 0 before archiving. This item still has stock. Record a valid Stock Out, transfer, or dispensing first.')
    const reason=clean(req.body?.reason,255)||'Archived by branch administrator'
    await conn.query('UPDATE inventory SET archived_at=NOW(),archived_by_admin_id=?,archive_reason=? WHERE id=? AND branch_id=?',[req.user.id,reason,prior.id,req.branchId])
    await audit(req,conn,'inventory.item_archived',prior.id,prior,{archived:true,reason})
    await conn.commit();conn.release();conn=null
    return res.json({archived:true,message:'Item archived. Historical inventory activity remains available.'})
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}

// Archived records remain visible to authorized Admins and can be restored
// without changing historical inventory movements or creating a duplicate item.
async function listArchivedItems(req,res) {
  const [rows] = await db.query(`SELECT id,name,barcode,category,item_type,archived_at,archive_reason,
    stock,threshold FROM inventory WHERE branch_id=? AND archived_at IS NOT NULL
    ORDER BY archived_at DESC,id DESC LIMIT 1000`,[req.branchId])
  return res.json(rows)
}
async function restoreArchivedItem(req,res) {
  let conn
  try {
    if(!positiveId(req.params.id))throw fail(400,'INVALID_ID','Select a valid archived item.')
    conn=await db.getConnection();await conn.beginTransaction()
    const [[prior]]=await conn.query('SELECT id,name,barcode,archived_at FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',
      [req.params.id,req.branchId])
    if(!prior)throw fail(404,'ITEM_NOT_FOUND','Inventory item was not found in this branch.')
    if(!prior.archived_at)throw fail(409,'NOT_ARCHIVED','This item is already active.')
    const [[other]]=await conn.query(`SELECT id FROM inventory WHERE branch_id=? AND id<>? AND archived_at IS NULL
      AND (barcode=? OR LOWER(TRIM(name))=LOWER(?)) LIMIT 1`,[req.branchId,prior.id,prior.barcode,prior.name])
    if(other)throw fail(409,'ACTIVE_ITEM_DUPLICATE','Another active item has this name or barcode. Review the duplicate before restoring.')
    await conn.query('UPDATE inventory SET archived_at=NULL,archived_by_admin_id=NULL,archive_reason=NULL WHERE id=? AND branch_id=?',
      [prior.id,req.branchId])
    await audit(req,conn,'inventory.item_restored',prior.id,{archived_at:prior.archived_at},{archived_at:null})
    await conn.commit();conn.release();conn=null
    return res.json({restored:true,message:`${prior.name} restored.`})
  } catch(error) {if(conn){await conn.rollback().catch(()=>{});conn.release()}return errorResponse(error,res)}
}

// Separate Excel operations: create item + opening batches, metadata edit, and
// authenticated stock receipts. Only the receipt engines change stock balances.
const bulkFields = (value, allowed) => value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>allowed.includes(k))
const priceMatch=(a,b)=>Number(a).toFixed(2)===Number(b).toFixed(2)
const validMoney=value=>Number.isFinite(Number(value))&&Number(value)>=0.01&&Number(value)<=99999999&&Math.abs(Number(value)*100-Math.round(Number(value)*100))<0.000001
const getTodayDateOnly = () => new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10)
const validWhole = value => typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value
const validBatch = b => bulkFields(b,['quantity','expiration_date','supplier_lot_number','unit_cost','location_id','supplier_id']) && validWhole(b.quantity) && b.quantity>0 && validMoneyOrZero(b.unit_cost) && (!b.supplier_lot_number || String(b.supplier_lot_number).length<=120) && positiveId(b.location_id) && positiveId(b.supplier_id) && validDate(b.expiration_date) && b.expiration_date>=getTodayDateOnly()
const validMoneyOrZero = v => typeof v==='number' && Number.isFinite(v) && v>=0 && v<=99999999 && Math.abs(v*100-Math.round(v*100))<0.000001
const getValidReceivingRefs = async (conn, branchId, category, b) => {
 const [[room]]=await conn.query('SELECT id,name FROM inventory_locations WHERE id=? AND branch_id=? AND is_active=1',[b.location_id,branchId])
 if(!room)throw fail(400,'INVALID_STOCK_ROOM','Opening batch Stock Room is inactive or belongs to another clinic branch.')
 const [[supplier]]=await conn.query('SELECT id,name,category FROM inventory_suppliers WHERE id=? AND branch_id=? AND is_active=1',[b.supplier_id,branchId])
 if(!supplier || !String(supplier.category||'').split(',').map(x=>x.trim()).includes(category))throw fail(400,'INVALID_SUPPLIER','Opening batch supplier is not active for this category and branch.')
 return {room,supplier}
}

const bulkRows = body => {
  if(!Array.isArray(body?.items)||!body.items.length||body.items.length>200)throw fail(400,'INVALID_BULK_SIZE','Choose 1 to 200 items per Excel upload.')
  return body.items
}
async function bulkCreateItems(req,res) {
  let conn
  try {
    const rows=bulkRows(req.body)
    if(rows.reduce((total,row)=>total+(Array.isArray(row.opening_batches)?row.opening_batches.length:0),0)>1000)throw fail(400,'TOO_MANY_OPENING_BATCHES','Upload at most 1,000 opening batches per file.')
    const seen=new Set()
    for(const row of rows) {
      if(!bulkFields(row,['name','category','item_type','stock','selling_price','threshold','supplier_id','default_location_id','opening_batches'])) throw fail(400,'FORBIDDEN_BULK_FIELD','New-item Excel only accepts item details and verified opening batches.')
      if(row.stock!==0||row.item_type!=='medicine')throw fail(400,'INVALID_ITEM_TYPE','New-item Excel currently supports Medicine only. Opening quantity is calculated from batch rows.')
      if((row.opening_batches!==undefined&&!Array.isArray(row.opening_batches))||(row.opening_batches||[]).length>30||(row.opening_batches||[]).some(b=>!validBatch(b)))throw fail(400,'INVALID_OPENING_BATCH','Each opening batch needs a whole positive quantity, valid future expiry, active Stock Room, supplier, and valid unit cost.')
      const rawName=String(row.name||'').trim()
      if(!rawName || rawName.length>150)throw fail(400,'INVALID_ITEM_NAME','Item Name is required (maximum 150 characters).')
      const key=rawName.toLowerCase()
      if(seen.has(key))throw fail(400,'DUPLICATE_BULK_ITEM','The Excel file contains duplicate item names.')
      seen.add(key)
      if(!Number.isSafeInteger(Number(row.threshold))||Number(row.threshold)<0||!validMoney(row.selling_price))throw fail(400,'INVALID_ITEM','Check the selling price and low-stock alert values.')
    }
    conn=await db.getConnection();await conn.beginTransaction()
    const created=[]
    for(const row of rows) {
      const p=normalize(row)
      const supplier=await validateReferences(conn,req.branchId,p)
      const [[existing]]=await conn.query('SELECT id,archived_at FROM inventory WHERE branch_id=? AND LOWER(TRIM(name))=LOWER(?) LIMIT 1',[req.branchId,p.name])
      if(existing)throw fail(409,existing.archived_at?'INVENTORY_ARCHIVED':'INVENTORY_DUPLICATE',existing.archived_at?`${p.name} is archived. Restore it from Archived Items first. No items have been saved.`:`Item already exists: ${p.name}. No items have been saved.`)
      const barcode=await nextInventoryBarcode(p.category,req.branchId,conn)
      const [result]=await conn.query(`INSERT INTO inventory
        (branch_id,barcode,name,category,item_type,uom,dosage_form,strength,measurement_value,measurement_unit,unit,base_unit,unit_size,stock,stock_base,threshold,price,selling_price,supplier,supplier_id,default_location_id)
        VALUES (?,?,?,?,?,'unit',?,?,?,?,'unit','unit',1,0,0,?,?,?,?,?,?)`,
        [req.branchId,barcode,p.name,p.category,p.item_type,p.dosage_form,p.strength,p.measurement_value,p.measurement_unit,p.threshold,p.selling_price,p.selling_price,supplier?.name||null,p.supplier_id,p.default_location_id])
      let openingQuantity=0
      const receivedBatchIds=[]
      for(const batch of (row.opening_batches||[])){
        const {room,supplier:batchSupplier}=await getValidReceivingRefs(conn,req.branchId,p.category,batch)
        const receipt=await receiveInventoryBatch(result.insertId,{quantity:batch.quantity,expiration_date:batch.expiration_date,location_id:room.id,supplier_id:batchSupplier.id,supplier_lot_number:batch.supplier_lot_number||null,unit_cost:batch.unit_cost,note:'Excel opening stock'},conn)
        await conn.query(`INSERT INTO inventory_logs (inventory_id,admin_id,type,qty,note,movement_type,batch_id,to_location,branch_id)
          VALUES (?,?,'in',?,'Excel opening stock','received',?,?,?)`,[result.insertId,req.user.id,batch.quantity,receipt.batch_id,room.name,req.branchId])
        openingQuantity+=batch.quantity
        receivedBatchIds.push({id:receipt.batch_id,quantity:Number(batch.quantity)})
      }
      if(openingQuantity>0)await syncInventorySnapshot(result.insertId,conn)
      await audit(req,conn,'inventory.item_created',result.insertId,null,{...p,barcode,opening_quantity:openingQuantity,opening_batch_count:(row.opening_batches||[]).length,source:'excel_import'})
      created.push({id:result.insertId,name:p.name,barcode,opening_quantity:openingQuantity,
        opening_batches:(row.opening_batches||[]).length,batch_ids:receivedBatchIds,
        selling_price:Number(p.selling_price),threshold:Number(p.threshold)})
    }
    const [savedUpload]=await conn.query(`INSERT INTO inventory_excel_uploads
      (branch_id,upload_type,changes_json,created_by_admin_id) VALUES (?,?,?,?)`,
      [req.branchId,'new_items',JSON.stringify(created),req.user.id])
    await conn.commit();conn.release();conn=null
    return res.status(201).json({created:created.length,updated:0,items:created,upload_id:savedUpload.insertId,
      message:'New items and opening batches were saved. Stock balances match the received batches.'})
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}

// Import Stock In for existing items, with a branch-scoped idempotency record.
// The same receipt reference never adds stock twice, even after a browser retry.
async function bulkReceiveItems(req,res){
 let conn
 try{
  const rows=bulkRows(req.body),seen=new Set()
  for(const row of rows){
   if(!bulkFields(row,['id','barcode','receipt_reference','quantity','expiration_date','supplier_lot_number','unit_cost','location_id','supplier_id']) || !positiveId(row.id) || !validBatch({quantity:row.quantity,expiration_date:row.expiration_date,supplier_lot_number:row.supplier_lot_number,unit_cost:row.unit_cost,location_id:row.location_id,supplier_id:row.supplier_id}))throw fail(400,'INVALID_RECEIPT','Each Stock In row needs an item, valid batch details and receipt reference.')
   const ref=String(row.receipt_reference||'').trim()
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{4,79}$/.test(ref))throw fail(400,'INVALID_RECEIPT_REFERENCE','Receipt Reference must be 5–80 letters, digits, dashes or underscores.')
   const key=ref.toLowerCase();if(seen.has(key))throw fail(400,'DUPLICATE_RECEIPT_REFERENCE','The same receipt reference appears twice in this Excel upload.')
   seen.add(key)
  }
  conn=await db.getConnection();await conn.beginTransaction()
  const received=[]
  for(const row of rows){
   const [[item]]=await conn.query('SELECT id,name,barcode,category,archived_at FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[row.id,req.branchId])
   if(!item||item.archived_at)throw fail(409,'INVENTORY_NOT_FOUND','Item is missing or archived in this clinic branch.')
   if(String(item.barcode||'')!==String(row.barcode||''))throw fail(409,'BARCODE_MISMATCH',`Barcode changed for ${item.name}. Download a fresh Stock In template.`)
   // Claim the reference before any batch movement. DB unique key prevents two
   // requests from recording the same external stock delivery twice.
   const [[existing]]=await conn.query('SELECT id FROM inventory_excel_receipts WHERE branch_id=? AND receipt_reference=? LIMIT 1',[req.branchId,row.receipt_reference])
   if(existing)throw fail(409,'RECEIPT_ALREADY_IMPORTED',`Receipt ${row.receipt_reference} was already imported. No additional stock was received.`)
   await conn.query('INSERT INTO inventory_excel_receipts (branch_id,receipt_reference,inventory_id,created_by_admin_id) VALUES (?,?,?,?)',[req.branchId,row.receipt_reference,item.id,req.user.id])
   const {room,supplier}=await getValidReceivingRefs(conn,req.branchId,item.category,row)
   const receipt=await receiveInventoryBatch(item.id,{quantity:row.quantity,expiration_date:row.expiration_date,location_id:room.id,supplier_id:supplier.id,supplier_lot_number:row.supplier_lot_number||null,unit_cost:row.unit_cost,note:`Excel Stock In ${row.receipt_reference}`},conn)
   await syncInventorySnapshot(item.id,conn)
   await conn.query(`INSERT INTO inventory_logs (inventory_id,admin_id,type,qty,note,movement_type,batch_id,to_location,branch_id) VALUES (?,?,'in',?,?,'received',?,?,?)`,[item.id,req.user.id,row.quantity,`Excel Stock In ${row.receipt_reference}`,receipt.batch_id,room.name,req.branchId])
   await conn.query('UPDATE inventory_excel_receipts SET batch_id=? WHERE branch_id=? AND receipt_reference=?',[receipt.batch_id,req.branchId,row.receipt_reference])
   await audit(req,conn,'inventory.bulk_stock_received',item.id,null,{receipt_reference:row.receipt_reference,quantity:row.quantity,batch_id:receipt.batch_id,location:room.name,supplier:supplier.name})
   received.push({id:item.id,batch_id:receipt.batch_id,receipt_reference:row.receipt_reference,quantity:row.quantity})
  }
  await conn.commit();conn.release();conn=null
  return res.status(201).json({created:0,updated:received.length,receipts:received,message:`${received.length} stock receipt(s) recorded. Inventory and batch balances were updated.`})
 }catch(error){if(conn){await conn.rollback().catch(()=>{});conn.release()}if(error.code==='ER_DUP_ENTRY')return res.status(409).json({code:'RECEIPT_ALREADY_IMPORTED',message:'This receipt reference has already been used. Stock was not added again.'});return errorResponse(error,res)}
}

// Conflict handling must run inside the same transaction as the write. Compare
// only explicitly requested fields: unrelated metadata changes do not block edits.
const bulkDetailError=(code,prior,row,field,downloaded,current,requested)=>{
  const rowLabel=Number.isSafeInteger(Number(row.excel_row))&&Number(row.excel_row)>1?`Excel row ${row.excel_row}: `:''
  const friendly=field==='selling_price'?'Selling Price':'Low Stock Alert'
  const error=fail(409,code,`${rowLabel}${prior.name} — ${friendly} was updated after you downloaded the file. Current: ${current}. Download a fresh Excel file to review this change. Nothing was saved.`)
  error.details={excel_row:row.excel_row||null,item_id:prior.id,item_name:prior.name,field:friendly,downloaded,current,requested}
  return error
}
async function bulkUpdateItems(req,res) {
  let conn
  try {
    const rows=bulkRows(req.body),seen=new Set()
    for(const row of rows) {
      if(!bulkFields(row,['id','barcode','changes','expected','excel_row']) ||
        !bulkFields(row.changes,['selling_price','threshold']) ||
        !bulkFields(row.expected,['selling_price','threshold']) ||
        !row.changes || !row.expected || !Object.keys(row.changes).length ||
        Object.keys(row.changes).length!==Object.keys(row.expected).length ||
        Object.keys(row.changes).some(key=>!Object.hasOwn(row.expected,key))) {
        throw fail(400,'FORBIDDEN_BULK_FIELD','Excel Bulk Edit only allows New Selling Price and New Low Stock Alert. Other item details, quantities, and batches cannot be changed.')
      }
      if(!positiveId(row.id)||seen.has(Number(row.id)))throw fail(400,'INVALID_BULK_ID','Item IDs must be valid and appear only once.')
      seen.add(Number(row.id))
      if(Object.hasOwn(row.changes,'selling_price') && (!validMoney(row.changes.selling_price) || !validMoney(row.expected.selling_price)))throw fail(400,'INVALID_BULK_VALUE','Selling Price must be greater than zero with up to two decimal places.')
      if(Object.hasOwn(row.changes,'threshold') && (![row.changes.threshold,row.expected.threshold].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)))throw fail(400,'INVALID_BULK_VALUE','Low Stock Alert must be a whole number of 0 or more.')
      if(row.excel_row!==undefined && (!Number.isSafeInteger(row.excel_row)||row.excel_row<2||row.excel_row>2001))throw fail(400,'INVALID_EXCEL_ROW','Excel row number is invalid.')
    }
    conn=await db.getConnection();await conn.beginTransaction()
    const updated=[],alreadyApplied=[]
    for(const row of rows) {
      const [[prior]]=await conn.query('SELECT * FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[row.id,req.branchId])
      if(!prior||prior.archived_at)throw fail(409,'ITEM_UNAVAILABLE',`Item ID ${row.id} is missing or archived in this branch. No items were saved.`)
      if(String(prior.barcode||'')!==String(row.barcode||''))throw fail(409,'BARCODE_MISMATCH',`Barcode changed for ${prior.name}. Download a new Bulk Edit file. No items were saved.`)
      const updates=[]
      const auditBefore={},auditAfter={source:'excel_bulk_edit'}
      for(const field of ['selling_price','threshold']){
        if(!Object.hasOwn(row.changes,field))continue
        const current=field==='selling_price'?Number(prior.selling_price):Number(prior.threshold)
        const requested=Number(row.changes[field])
        const downloaded=Number(row.expected[field])
        const same=field==='selling_price'?priceMatch:(a,b)=>a===b
        if(same(current,requested))continue // Re-uploading a successful change is safe.
        if(!same(current,downloaded))throw bulkDetailError('BULK_FIELD_CONFLICT',prior,row,field,downloaded,current,requested)
        if(field==='selling_price') {
          const [[linked]]=await conn.query('SELECT COUNT(*) AS n FROM billing_service_materials WHERE inventory_id=?',[prior.id])
          if(Number(linked.n)>0)throw fail(409,'LINKED_SERVICE_REPRICING',`${prior.name} is linked to billable services. Change its price using Services & Pricing. No items were saved.`)
        }
        updates.push(field)
        auditBefore[field]=current
        auditAfter[field]=requested
      }
      if(!updates.length){alreadyApplied.push({id:prior.id,name:prior.name});continue}
      // Deliberately never touch item names, stock, stock logs, batches, bills, or receipts.
      const sets=[],params=[]
      if(updates.includes('selling_price')){sets.push('selling_price=?','price=?');params.push(row.changes.selling_price,row.changes.selling_price)}
      if(updates.includes('threshold')){sets.push('threshold=?');params.push(row.changes.threshold)}
      params.push(prior.id,req.branchId)
      await conn.query(`UPDATE inventory SET ${sets.join(',')} WHERE id=? AND branch_id=?`,params)
      await audit(req,conn,'inventory.item_bulk_details_updated',prior.id,auditBefore,auditAfter)
      updated.push({id:prior.id,name:prior.name,fields:updates,
        before:auditBefore,after:Object.fromEntries(updates.map(field=>[field,Number(row.changes[field])]))})
    }
    let uploadId=null
    if(updated.length){
      const [savedUpload]=await conn.query(`INSERT INTO inventory_excel_uploads
        (branch_id,upload_type,changes_json,created_by_admin_id) VALUES (?,?,?,?)`,
        [req.branchId,'item_edits',JSON.stringify(updated),req.user.id])
      uploadId=savedUpload.insertId
    }
    await conn.commit();conn.release();conn=null
    return res.json({created:0,updated:updated.length,already_applied:alreadyApplied.length,items:updated,upload_id:uploadId,message:updated.length?`${updated.length} item(s) updated. Earlier bills, stock movements, and current quantities were not edited.`:'These changes are already applied. Nothing else was updated.'})
  }catch(e){if(conn){await conn.rollback();conn.release()}return errorResponse(e,res)}
}

// Excel upload history and guarded Undo. This never deletes a used medicine,
// reverses a clinical/billing entry, or rewrites payment records.
async function listExcelUploads(req,res){
  const page = Number(req.query.page || 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return res.status(400).json({code:'INVALID_PAGE',message:'Choose a valid history page.'})
  const limit = 10
  const [[count]] = await db.query('SELECT COUNT(*) AS total FROM inventory_excel_uploads WHERE branch_id=?',[req.branchId])
  const total = Number(count?.total || 0)
  const totalPages = Math.max(1,Math.ceil(total/limit))
  const safePage = Math.min(page,totalPages)
  const [rows]=await db.query(`SELECT id,upload_type,created_at,created_by_admin_id,undone_at,undone_by_admin_id
    FROM inventory_excel_uploads WHERE branch_id=? ORDER BY id DESC LIMIT ? OFFSET ?`,[req.branchId,limit,(safePage-1)*limit])
  return res.json({items:rows,pagination:{page:safePage,limit,total,totalPages}})
}
async function undoExcelUpload(req,res){
  let conn
  try{
    if(!positiveId(req.params.id))throw fail(400,'INVALID_UPLOAD','Select a valid Excel upload.')
    const reason=clean(req.body?.reason,255)
    if(reason.length<5||req.body?.confirmation!=='UNDO')throw fail(400,'CONFIRM_REQUIRED','Type UNDO and enter a reason of at least 5 characters.')
    conn=await db.getConnection();await conn.beginTransaction()
    const [[upload]]=await conn.query('SELECT * FROM inventory_excel_uploads WHERE id=? AND branch_id=? FOR UPDATE',[req.params.id,req.branchId])
    if(!upload)throw fail(404,'UPLOAD_NOT_FOUND','Excel upload not found in this clinic branch.')
    if(upload.undone_at)throw fail(409,'ALREADY_UNDONE','This Excel upload was already undone.')
    const changes=typeof upload.changes_json==='string'?JSON.parse(upload.changes_json):upload.changes_json
    if(!Array.isArray(changes)||!changes.length)throw fail(409,'EMPTY_UPLOAD','This upload contains no changes to undo.')
    if(upload.upload_type==='new_items'){
      // A new-item import is removable only if all item details, all opening
      // batches, and all stock movement logs still match the original upload.
      // Every later stock movement, service link or clinical/billing reference
      // blocks the entire Undo transaction.
      for(const item of changes){
        const [[current]]=await conn.query('SELECT * FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[item.id,req.branchId])
        if(!current||current.archived_at||String(current.name)!==String(item.name)||String(current.barcode)!==String(item.barcode)||
          !priceMatch(current.selling_price,item.selling_price)||Number(current.threshold)!==Number(item.threshold)||
          Number(current.stock)!==Number(item.opening_quantity)){
          throw fail(409,'ITEM_CHANGED',`${item.name} changed after import. Undo was stopped; no data was deleted.`)
        }
        const [batches]=await conn.query('SELECT id,quantity FROM inventory_batches WHERE inventory_id=? ORDER BY id FOR UPDATE',[item.id])
        const initial=item.batch_ids||[]
        if(batches.length!==initial.length||batches.some(b=>!initial.some(x=>Number(x.id)===Number(b.id)&&Number(x.quantity)===Number(b.quantity))))
          throw fail(409,'BATCH_CHANGED',`${item.name} has later or changed batches. Undo was stopped.`)
        const [logs]=await conn.query('SELECT id,batch_id,qty,movement_type FROM inventory_logs WHERE inventory_id=? AND branch_id=? FOR UPDATE',[item.id,req.branchId])
        if(logs.length!==initial.length||logs.some(l=>l.movement_type!=='received'||!initial.some(x=>Number(x.id)===Number(l.batch_id)&&Number(x.quantity)===Number(l.qty))))
          throw fail(409,'STOCK_USED',`${item.name} has other stock movements. Undo was stopped.`)
        const [[uses]]=await conn.query(`SELECT
          (SELECT COUNT(*) FROM billing_service_materials WHERE inventory_id=?) +
          (SELECT COUNT(*) FROM billing_items WHERE source_inventory_id=?) +
          (SELECT COUNT(*) FROM consultation_inventory_usage WHERE inventory_id=?) +
          (SELECT COUNT(*) FROM supply_requests WHERE inventory_id=?) +
          (SELECT COUNT(*) FROM inventory_transfers WHERE inventory_id=?) +
          (SELECT COUNT(*) FROM inventory_excel_receipts WHERE inventory_id=?) AS total`,
          [item.id,item.id,item.id,item.id,item.id,item.id])
        if(Number(uses?.total)>0)throw fail(409,'ITEM_REFERENCED',`${item.name} is linked to a service, visit, transfer, or receipt. Undo was stopped.`)
      }
      for(const item of changes){
        // Foreign keys and the transaction also protect against new references.
        const [deleted]=await conn.query('DELETE FROM inventory WHERE id=? AND branch_id=? AND archived_at IS NULL',[item.id,req.branchId])
        if(Number(deleted.affectedRows)!==1)throw fail(409,'ITEM_CHANGED','An imported item changed during Undo.')
        await audit(req,conn,'inventory.excel_import_item_undone',item.id,{barcode:item.barcode,opening_quantity:item.opening_quantity},{upload_id:upload.id,reason})
      }
    } else if(upload.upload_type==='item_edits'){
      for(const item of changes){
        const [[current]]=await conn.query('SELECT id,name,archived_at,selling_price,threshold FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[item.id,req.branchId])
        if(!current||current.archived_at||String(current.name)!==String(item.name))throw fail(409,'ITEM_CHANGED',`${item.name} is missing or changed. Undo was stopped.`)
        for(const field of item.fields){
          const same=field==='selling_price'?priceMatch:(a,b)=>Number(a)===Number(b)
          if(!same(current[field],item.after[field]))throw fail(409,'ITEM_CHANGED',`${item.name} ${field} changed after import. Undo was stopped.`)
        }
      }
      for(const item of changes){
        const sets=[],params=[]
        if(item.fields.includes('selling_price')){sets.push('selling_price=?','price=?');params.push(item.before.selling_price,item.before.selling_price)}
        if(item.fields.includes('threshold')){sets.push('threshold=?');params.push(item.before.threshold)}
        params.push(item.id,req.branchId)
        await conn.query(`UPDATE inventory SET ${sets.join(',')} WHERE id=? AND branch_id=?`,params)
        await audit(req,conn,'inventory.excel_edit_undone',item.id,item.after,{...item.before,upload_id:upload.id,reason})
      }
    } else throw fail(409,'UNDO_NOT_SUPPORTED','This Excel upload type cannot be undone automatically.')
    await conn.query('UPDATE inventory_excel_uploads SET undone_at=NOW(),undone_by_admin_id=?,undo_reason=? WHERE id=? AND branch_id=?',
      [req.user.id,reason,upload.id,req.branchId])
    await conn.commit();conn.release();conn=null
    return res.json({undone:true,message:`Excel upload #${upload.id} was undone. All affected items were checked.`})
  }catch(error){if(conn){await conn.rollback().catch(()=>{});conn.release()}return errorResponse(error,res)}
}

function registerBranchInventoryItems(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('inventory')]
  router.get(`${prefix}/inventory/archived`,...guard,listArchivedItems)
  router.get(`${prefix}/inventory/excel-imports`,...guard,listExcelUploads)
  router.post(`${prefix}/inventory/excel-imports/:id/undo`,...guard,afterSuccessfulMutation('inventory.updated'),undoExcelUpload)
  router.post(`${prefix}/inventory/:id/restore`,...guard,afterSuccessfulMutation('inventory.updated'),restoreArchivedItem)
  router.post(`${prefix}/inventory`,...guard,afterSuccessfulMutation('inventory.updated'),createItem)
  router.post(`${prefix}/inventory/import-new`,...guard,afterSuccessfulMutation('inventory.updated'),bulkCreateItems)
  router.post(`${prefix}/inventory/bulk-update`,...guard,afterSuccessfulMutation('inventory.updated'),bulkUpdateItems)
  router.post(`${prefix}/inventory/bulk-receive`,...guard,afterSuccessfulMutation('inventory.updated'),bulkReceiveItems)
  router.put(`${prefix}/inventory/:id`,...guard,afterSuccessfulMutation('inventory.updated'),updateItem)
  router.delete(`${prefix}/inventory/:id`,...guard,afterSuccessfulMutation('inventory.updated'),archiveItem)
 }
}
module.exports={registerBranchInventoryItems,createItem,updateItem,archiveItem,listArchivedItems,restoreArchivedItem,listExcelUploads,undoExcelUpload,bulkCreateItems,bulkUpdateItems,bulkReceiveItems}





