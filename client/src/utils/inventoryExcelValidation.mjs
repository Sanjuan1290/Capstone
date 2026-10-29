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
      if(!whole(qty)||Number(qty)!==Number(initial))errors.push('For new items Quantity must equal Initial Stock')
      if(Number(initial)>0&&!iso(expiry))errors.push('Opening stock requires a real YYYY-MM-DD expiry date')
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
      }:{stock:Number(initial),expiration_date:expiry,supplier_lot_missing:true,unit_cost:0,no_expiry:false}),
    }
    const changed=existing?(
      existing.name!==name||existing.category!==category||Number(existing.selling_price??existing.price)!==Number(sellingPrice)||
      Number(existing.threshold)!==Number(lowAlert)||Number(existing.default_location_id)!==Number(stockRoom?.id)||
      Number(existing.supplier_id)!==Number(supplier?.id)
    ):true
    return {row:row._excelRow||0,name,action,existing,payload,errors,changed}
  })
}
