'use strict'
// Batch-free inventory foundation. CALLERS OWN THE TRANSACTION. Never use from a
// legacy batch-writing workflow or before the independently verified cutover.
// No external network I/O and no implicit migration/backfill on import.
const SCALE = 10000n
const err = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code })
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
function decimalToUnits(value, {allowZero=false}={}) {
  const raw = String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(raw)) throw err(400,'INVALID_STOCK_QUANTITY','Use a nonnegative quantity with up to four decimal places.')
  const [whole,fraction=''] = raw.split('.')
  const count = BigInt(whole)*SCALE+BigInt(fraction.padEnd(4,'0'))
  if ((!allowZero && count===0n)||count>9999999999990000n) throw err(400,'INVALID_STOCK_QUANTITY','Enter a supported positive quantity.')
  return count
}
function unitsToDecimal(count) {
  const n=BigInt(count); const neg=n<0n; const abs=neg?-n:n
  return `${neg?'-':''}${abs/SCALE}.${String(abs%SCALE).padStart(4,'0')}`
}
const requiredMode=async(executor)=>{
  assertLocationModeRequested()
  const [[row]]=await executor.query('SELECT mode, cutover_verified_at FROM inventory_stock_mode WHERE id=1')
  if(!row||row.mode!=='location'||!row.cutover_verified_at) throw err(503,'LOCATION_CUTOVER_NOT_VERIFIED','Batch-free inventory is not enabled or its cutover is not verified.')
}
const assertLocationModeRequested=()=>{
  if(process.env.CARAIT_INVENTORY_LOCATION_MODE!=='enabled') throw err(503,'LOCATION_MODE_DISABLED','Batch-free operations are not enabled for this deployment.')
}
const selectItem=async(executor,branchId,inventoryId)=>{
  const [[item]]=await executor.query(`SELECT id,branch_id,name,item_type,expiration_date,unit_size,archived_at
     FROM inventory WHERE id=? AND branch_id=? FOR UPDATE`,[inventoryId,branchId])
  if(!item)throw err(404,'INVENTORY_NOT_FOUND','Item not found in your branch.')
  if(item.archived_at)throw err(409,'INVENTORY_ARCHIVED','Archived inventory cannot be moved.')
  return item
}
const validLocation=async(executor,branchId,id)=>{
  if(!positiveId(id))throw err(400,'LOCATION_REQUIRED','Choose a valid inventory location.')
  const [[location]]=await executor.query(`SELECT id,name,is_active,location_type
    FROM inventory_locations WHERE id=? AND branch_id=? FOR UPDATE`,[id,branchId])
  if(!location||!Number(location.is_active))throw err(404,'LOCATION_NOT_ACTIVE','Location is not active in this branch.')
  return location
}
const manilaDateOnly=value=>{
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))return ''
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(value)
  }
  const text=String(value||'')
  return /^\d{4}-\d{2}-\d{2}$/.test(text.slice(0,10)) ? text.slice(0,10) : ''
}
const todayManila=()=>manilaDateOnly(new Date())
function checkMedicineExpiry(item,movementType) {
  if(item.item_type!=='medicine'||!['issue','transfer','release'].includes(movementType))return
  const expiry=manilaDateOnly(item.expiration_date)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry<todayManila())
    throw err(409,'MEDICINE_EXPIRY_UNVERIFIED','This medicine has no verified future item-level expiry. Quarantine/reconcile it before issuing or moving it.')
}
const stockAt=async(executor,itemId,locationId)=>{
  const [[r]]=await executor.query(`SELECT quantity FROM inventory_location_stock
     WHERE inventory_id=? AND location_id=? FOR UPDATE`,[itemId,locationId])
  return decimalToUnits(r?.quantity??'0',{allowZero:true})
}
const summarize=async(executor,itemId,unitSize)=>{
  const [[r]]=await executor.query(`SELECT COALESCE(SUM(quantity),0) AS total FROM inventory_location_stock WHERE inventory_id=?`,[itemId])
  const total=decimalToUnits(r?.total??'0',{allowZero:true})
  const factor=decimalToUnits(unitSize??'1',{allowZero:false})
  // round only at the 4-decimal precision boundary; ordinary unit_size=1 is exact.
  const base=(total*factor)/SCALE
  await executor.query(`UPDATE inventory SET stock=?,stock_base=? WHERE id=?`,[unitsToDecimal(total),unitsToDecimal(base),itemId])
  return unitsToDecimal(total)
}
// One logical movement = one append-only ledger row and one atomic balance change.
// Every request must carry a unique, stable idempotency key (HTTP retries reuse it).
async function applyLocationMovement({executor,branchId,inventoryId,type,quantity,sourceLocationId=null,destinationLocationId=null,
 reason,referenceType=null,referenceId=null,actorRole,actorId,idempotencyKey,notes=null}) {
  if(!executor||typeof executor.query!=='function')throw err(500,'TRANSACTION_REQUIRED','A transaction-bound database connection is required.')
  if(!positiveId(branchId)||!positiveId(inventoryId))throw err(403,'BRANCH_REQUIRED','A valid branch and item are required.')
  if(!['receipt','issue','transfer','adjustment_in','adjustment_out'].includes(type))throw err(400,'MOVEMENT_TYPE_INVALID','Unsupported movement type.')
  if(typeof idempotencyKey!=='string'||!/^[-\w:.]{12,120}$/.test(idempotencyKey))throw err(400,'IDEMPOTENCY_KEY_REQUIRED','Provide a stable idempotency key of 12–120 characters.')
  if(!reason||!String(reason).trim()||String(reason).length>255)throw err(400,'MOVEMENT_REASON_REQUIRED','A documented movement reason is required.')
  if(!positiveId(actorId)||!['admin','staff','doctor','superadmin','system'].includes(actorRole))throw err(403,'MOVEMENT_ACTOR_REQUIRED','A verified authorized actor is required.')
  const qty=decimalToUnits(quantity)
  const fromRequired=['issue','transfer','adjustment_out'].includes(type)
  const toRequired=['receipt','transfer','adjustment_in'].includes(type)
  if(fromRequired&&!positiveId(sourceLocationId))throw err(400,'SOURCE_REQUIRED','Choose a source location.')
  if(toRequired&&!positiveId(destinationLocationId))throw err(400,'DESTINATION_REQUIRED','Choose a destination location.')
  if(fromRequired&&toRequired&&Number(sourceLocationId)===Number(destinationLocationId))throw err(400,'SAME_LOCATION','Source and destination must differ.')
  await requiredMode(executor)
  // Serializes all writes to this item, even when two transfers target distinct locations.
  const item=await selectItem(executor,Number(branchId),Number(inventoryId))
  const [[prior]]=await executor.query('SELECT id,inventory_id,movement_type,quantity_stock,branch_id,source_location_id,destination_location_id,reason_code,reference_type,reference_id,actor_role,actor_id FROM inventory_stock_movements WHERE idempotency_key=?',[idempotencyKey])
  if(prior){
    if(Number(prior.inventory_id)!==Number(inventoryId)||Number(prior.branch_id)!==Number(branchId)||prior.movement_type!==type||decimalToUnits(prior.quantity_stock)!==qty||Number(prior.source_location_id||0)!==Number(sourceLocationId||0)||Number(prior.destination_location_id||0)!==Number(destinationLocationId||0)||prior.reason_code!==String(reason).trim()||String(prior.reference_type||'')!==String(referenceType||'')||String(prior.reference_id||'')!==String(referenceId||'')||String(prior.actor_role||'')!==String(actorRole||'')||Number(prior.actor_id||0)!==Number(actorId||0))
      throw err(409,'IDEMPOTENCY_KEY_CONFLICT','This key was used for a different movement.')
    return {id:prior.id,replayed:true,quantity:unitsToDecimal(qty)}
  }
  const source=fromRequired?await validLocation(executor,branchId,sourceLocationId):null
  const destination=toRequired?await validLocation(executor,branchId,destinationLocationId):null
  checkMedicineExpiry(item,type)
  // A medicine must have location-specific, physically verified expiry/eligibility.
  // Legacy item.expiration_date alone cannot represent mixed-expiry units.
  if(item.item_type==='medicine') {
    const locations=[source,destination].filter(Boolean)
    for(const location of locations){
      const [[eligibility]]=await executor.query(`SELECT eligibility,verified_expiry FROM inventory_stock_eligibility
        WHERE inventory_id=? AND location_id=? FOR UPDATE`,[item.id,location.id])
      const expiry=manilaDateOnly(eligibility?.verified_expiry)
      if(eligibility?.eligibility!=='available'||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||expiry<todayManila())
        throw err(409,'MEDICINE_LOCATION_UNVERIFIED','This medicine/location has unverified or expired stock; no movements are allowed until reconciliation.')
    }
  }
  const previousSource=source?await stockAt(executor,item.id,source.id):0n
  const previousDestination=destination?await stockAt(executor,item.id,destination.id):0n
  if(source&&previousSource<qty)throw err(409,'INSUFFICIENT_LOCATION_STOCK','This location does not have enough stock.')
  const nextSource=source?previousSource-qty:null
  const nextDestination=destination?previousDestination+qty:null
  if(source){
    const [updated]=await executor.query(`UPDATE inventory_location_stock SET quantity=?
      WHERE inventory_id=? AND location_id=? AND quantity>=?`,[unitsToDecimal(nextSource),item.id,source.id,unitsToDecimal(qty)])
    if(updated.affectedRows!==1)throw err(409,'CONCURRENT_STOCK_CHANGE','Stock changed during this request. Retry with the same idempotency key.')
  }
  if(destination){
    await executor.query(`INSERT INTO inventory_location_stock (inventory_id,location_id,quantity) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,[item.id,destination.id,unitsToDecimal(nextDestination)])
  }
  const total=await summarize(executor,item.id,item.unit_size)
  const baseQty=(qty*decimalToUnits(item.unit_size??'1'))/SCALE
  const [written]=await executor.query(`INSERT INTO inventory_stock_movements
     (branch_id,inventory_id,movement_type,source_location_id,destination_location_id,quantity_stock,quantity_base,reason_code,reference_type,reference_id,
      actor_role,actor_id,idempotency_key,before_source,after_source,before_destination,after_destination,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[Number(branchId),item.id,type,source?.id??null,destination?.id??null,unitsToDecimal(qty),unitsToDecimal(baseQty),String(reason).trim(),referenceType,referenceId,
     actorRole,Number(actorId),idempotencyKey,source?unitsToDecimal(previousSource):null,source?unitsToDecimal(nextSource):null,
     destination?unitsToDecimal(previousDestination):null,destination?unitsToDecimal(nextDestination):null,notes?String(notes).slice(0,500):null])
  return {id:written.insertId,replayed:false,quantity:unitsToDecimal(qty),stock:total,source:source?.name??null,destination:destination?.name??null}
}
module.exports={decimalToUnits,unitsToDecimal,applyLocationMovement,assertLocationModeRequested,requiredMode,todayManila,manilaDateOnly}
