// Pure import preflight. Stock and batch expiry updates are NEVER performed here.
const idOf = value => Number(value)
const normalizedName = value => String(value??'').trim().toLocaleLowerCase('en')
const whole = value => value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0
const money = value => value!==''&&Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=99999999
const iso = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
const categoryOf = text => ({'dermatology':'derma','derma':'derma','general medicine':'medical','medical':'medical','gen med':'medical'})[normalizedName(text)]
const matchName = (text,name) => normalizedName(text) === normalizedName(name)
export function preflightInventoryExcel(rows,{items=[],stockRooms=[],suppliers=[]}={}){
  const seenNames=new Set(),seenIds=new Set()
  return rows.map(row=>{
    const errors=[]
    const name=String(row['Item Name']??'').trim(),id=String(row['Item ID']??'').trim(),existing=id?items.find(item=>Number(item.id)===Number(id)):null
    const category=categoryOf(row.Category)
    const stockRoom=stockRooms.find(room=>matchName(room.name,row['Stock Room'])&&Number(room.is_active??1)===1)
    const supplierLabel=String(row.Supplier||'JAS').trim()
    const supplier=suppliers.find(s=>matchName(s.name,supplierLabel)&&Number(s.is_active??1)===1&&String(s.category||'').split(',').some(c=>c.trim()===category))
    const qty=String(row.Quantity??'').trim(),initial=String(row['Initial Stock']??'').trim(),expiry=String(row['Expiration Date']??'').trim()
    const sellingPrice=String(row['Selling Price']??'').trim(),lowAlert=String(row['Low Stock Alert']??'').trim() || '5'
    const action=id?'update':'create'
    if(!name||name.length>150)errors.push('Item Name is required (max 150 characters)')
    if(!category)errors.push('Category must be General Medicine or Dermatology')
    if(!money(sellingPrice))errors.push('Selling Price must be a number greater than zero')
    if(!whole(lowAlert))errors.push('Low Stock Alert must be a whole number ≥ 0')
    if(!stockRoom)errors.push('Choose an active Stock Room from System Setup')
    if(!supplier)errors.push(`Supplier ${supplierLabel||'JAS'} must exist and support the selected category`)
    if(id){
      if(!Number.isSafeInteger(idOf(id))||idOf(id)<=0||!existing)errors.push('Item ID does not match an existing inventory item')
      if(existing && row.Barcode && String(row.Barcode)!==String(existing.barcode||''))errors.push('Barcode does not match the exported record')
      if(initial!=='')errors.push('Initial Stock cannot be modified on existing items')
      if(expiry)errors.push('Edit expiry through Manage Batches, not Excel')
      if(!whole(qty))errors.push('Exported Quantity must be a whole number')
      else if(existing && Number(qty)!==Number(existing.stock))errors.push('Quantity is read-only. Re-export after stock movements; use Stock In/Out for corrections')
      if(existing && Number(existing.linked_service_count)>0 && Number(existing.selling_price??existing.price)!==Number(sellingPrice))errors.push('This price is linked to services: edit pricing through Services & Pricing')
      // Current stock is never sent to the update endpoint.
      if(seenIds.has(id))errors.push('Duplicate Item ID in this spreadsheet')
      seenIds.add(id)
    }else{
      if(items.some(item=>matchName(item.name,name)))errors.push('Item already exists: use Export Bulk Edit to update it')
      if(!whole(initial))errors.push('Initial Stock must be a whole number ≥ 0')
      if(!whole(qty))errors.push('Quantity must be a whole number ≥ 0')
      if(Number(qty)>0&&!iso(expiry))errors.push('Opening stock requires a real YYYY-MM-DD expiry date')
      if(expiry&&!iso(expiry))errors.push('Invalid expiry date')
      if(expiry && iso(expiry) && expiry < new Date().toISOString().slice(0,10))errors.push('Opening stock expiry must not be in the past')
      const k=normalizedName(name);if(seenNames.has(k))errors.push('Duplicate Item Name in this spreadsheet');seenNames.add(k)
    }
    const payload={
      name,category,item_type:existing?.item_type||'medicine',
      barcode:existing?.barcode||'',supplier_id:supplier?.id||null,
      default_location_id:stockRoom?.id||null,threshold:Number(lowAlert),
      selling_price:Number(sellingPrice),price:Number(sellingPrice),
      ...(existing?{
        dosage_form:existing.dosage_form||null,strength:existing.strength||null,
        measurement_value:existing.measurement_value??null,measurement_unit:existing.measurement_unit||null,
      }:{stock:Number(qty),expiration_date:expiry,supplier_lot_missing:true,unit_cost:0,no_expiry:false}),
    }
    const changed=existing?(
      existing.name!==name||existing.category!==category||Number(existing.selling_price??existing.price)!==Number(sellingPrice)||
      Number(existing.threshold)!==Number(lowAlert)||Number(existing.default_location_id)!==Number(stockRoom?.id)||
      Number(existing.supplier_id)!==Number(supplier?.id)
    ):true
    return {row:row._excelRow||0,name,action,existing,payload,errors,changed}
  })
}



// The new metadata-only workflow never accepts any stock-affecting fields.
const supportsCategory = (supplier,category) => String(supplier?.category||'').split(',').map(c=>c.trim()).includes(category)
const samePrice = (a,b) => Number(a).toFixed(2) === Number(b).toFixed(2)
const validPrice = value => value!=='' && Number.isFinite(Number(value)) && Number(value)>=0.01 && Number(value)<=99999999 && Math.abs(Number(value)*100-Math.round(Number(value)*100))<0.000001
const requireWhole = value => String(value??'').trim()!=='' && Number.isSafeInteger(Number(value)) && Number(value)>=0
const supplierByName = (value, suppliers, category) => {
  const label=String(value??'').trim()
  if(!label) return null
  return suppliers.find(s=>matchName(s.name,label) && Number(s.is_active??1)===1 && supportsCategory(s,category)) || null
}
export const MAX_INVENTORY_IMPORT_BATCH = 200

export function preflightInventoryCreate(rows,{items=[],stockRooms=[],suppliers=[]}={}) {
  const seen=new Set()
  return rows.map(row=>{
    const errors=[], name=String(row['Item Name']??'').trim(),category=categoryOf(row.Category)
    const price=String(row['Selling Price']??'').trim(), threshold=String(row['Low Stock Alert']??'').trim()
    const room=stockRooms.find(r=>matchName(r.name,row['Stock Room']) && Number(r.is_active??1)===1)
    const supplierLabel=String(row.Supplier??'').trim()
    const supplier=supplierByName(supplierLabel,suppliers,category)
    if(!name||name.length>150) errors.push('Item Name is required (maximum 150 characters).')
    if(!category) errors.push('Category must be General Medicine or Dermatology.')
    if(!validPrice(price)) errors.push('Selling Price must be above zero, with at most two decimal places.')
    if(!requireWhole(threshold)) errors.push('Low Stock Alert must be a whole number (0 or more).')
    if(!room) errors.push('Select an active Stock Room in this branch.')
    if(supplierLabel&&!supplier) errors.push('Supplier must be active and available for this category and branch.')
    if(items.some(i=>matchName(i.name,name)))errors.push('Item already exists. Use Update Existing Items.')
    const key=normalizedName(name);if(seen.has(key))errors.push('Duplicate item name in the Excel file.');seen.add(key)
    const payload={name,category,item_type:'medicine',stock:0,selling_price:Number(price),threshold:Number(threshold),supplier_id:supplier?.id||null,default_location_id:room?.id||null}
    return {row:row._excelRow||0,name,action:'create',payload,errors,changed:true,before:null}
  })
}

// Bulk Edit can change exactly two independent catalog fields. The Current columns
// are a snapshot from export; the New columns are optional. A repeated upload is a
// no-op if the requested value is already in the database. Unrelated changes are
// never overwritten or treated as conflicts.
export function preflightInventoryBulkEdit(rows,{items=[]}={}) {
  const seen=new Set()
  return rows.map(row=>{
    const errors=[]
    const id=String(row['Item ID']??'').trim()
    const item=items.find(i=>String(i.id)===id)
    const name=String(row['Item Name']??'').trim()
    const expectedPrice=String(row['Current Selling Price']??'').trim()
    const requestedPrice=String(row['New Selling Price']??'').trim()
    const expectedThreshold=String(row['Current Low Stock Alert']??'').trim()
    const requestedThreshold=String(row['New Low Stock Alert']??'').trim()
    const changes={},expected={},fieldChanges=[],alreadyApplied=[]

    if(!/^\d{1,12}$/.test(id)||Number(id)<=0||!item)errors.push('Item ID does not belong to your selected clinic branch.')
    if(!row.Barcode||!item||String(row.Barcode)!==String(item.barcode||''))errors.push('Barcode does not match the inventory record. Download a fresh file.')
    if(item && name!==item.name) errors.push('Item Name is for reference only. Use Edit Item to rename a product.')
    if(!validPrice(expectedPrice))errors.push('Current Selling Price is invalid. Download a fresh file.')
    if(!requireWhole(expectedThreshold))errors.push('Current Low Stock Alert is invalid. Download a fresh file.')
    if(seen.has(id))errors.push('Duplicate Item ID in this Excel file.')
    seen.add(id)

    // Blank New fields do not request any change; 0 is valid for the alert.
    if(requestedPrice!=='') {
      if(!validPrice(requestedPrice))errors.push('New Selling Price must be above ₱0.00, with at most two decimal places.')
      else if(validPrice(expectedPrice) && !samePrice(requestedPrice,expectedPrice)) {
        const current=item?.selling_price??item?.price
        if(item && samePrice(current,requestedPrice)) alreadyApplied.push('Selling Price')
        else if(item && !samePrice(current,expectedPrice))errors.push(`Selling Price changed since export: downloaded ₱${Number(expectedPrice).toFixed(2)}, now ₱${Number(current).toFixed(2)}, requested ₱${Number(requestedPrice).toFixed(2)}. Download a fresh file to review this price.`)
        else {
          if(item && Number(item.linked_service_count)>0)errors.push('Selling Price is connected to billable services. Update it in Services & Pricing.')
          changes.selling_price=Number(requestedPrice)
          expected.selling_price=Number(expectedPrice)
          fieldChanges.push({label:'Selling Price',before:current,after:Number(requestedPrice)})
        }
      }
    }
    if(requestedThreshold!=='') {
      if(!requireWhole(requestedThreshold))errors.push('New Low Stock Alert must be a whole number of 0 or more.')
      else if(requireWhole(expectedThreshold) && Number(requestedThreshold)!==Number(expectedThreshold)) {
        const current=Number(item?.threshold)
        if(item && current===Number(requestedThreshold))alreadyApplied.push('Low Stock Alert')
        else if(item && current!==Number(expectedThreshold))errors.push(`Low Stock Alert changed since export: downloaded ${Number(expectedThreshold)}, now ${current}, requested ${Number(requestedThreshold)}. Download a fresh file to review this alert.`)
        else {
          changes.threshold=Number(requestedThreshold)
          expected.threshold=Number(expectedThreshold)
          fieldChanges.push({label:'Low Stock Alert',before:current,after:Number(requestedThreshold)})
        }
      }
    }
    const payload={id:Number(id),barcode:String(row.Barcode??''),changes,expected,excel_row:row._excelRow||0}
    return {row:row._excelRow||0,name:item?.name||name,action:'update',existing:item,payload,errors,changed:Object.keys(changes).length>0,fieldChanges,alreadyApplied,before:item&&{selling_price:item.selling_price??item.price,threshold:item.threshold}}
  })
}
