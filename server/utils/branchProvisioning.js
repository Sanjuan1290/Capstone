// Seeds operational setup in the SAME transaction that creates a branch.
// No patient, inventory stock, bill or batch is copied to the destination.
const stockrooms = [
  ['Main Stockroom','stockroom',1,null],
  ['General Medicine Room','room',0,'medical'],
  ['Dermatology Room','room',0,'derma'],
  ['Dispensing Area','dispensing',0,null],
]
const locationTypes = [
  ['Main Stockroom','stockroom',10],['Treatment Room','room',20],
  ['Dispensing Area','dispensing',30],['General Storage','storage',40],
]
const visitReasons = [
  ['General Consultation','medical',10],['Follow-up Visit','all',20],
  ['Annual Check-up','medical',30],['Vaccination','medical',40],
  ['Minor Procedure','medical',50],['Skin Assessment','derma',60],
  ['Acne Treatment','derma',70],['Rash / Allergy','derma',80],
]
const cancellationReasons = [
  ['Schedule conflict',10],['Feeling better / consultation no longer needed',20],
  ['Transportation issue',30],['Financial reason',40],['Booked another schedule',50],
]
const categories = [
  ['Consultation','medical',10],['Vaccination & Immunization','medical',20],
  ['Minor Procedures','medical',30],['Other Medical Services','medical',50],
  ['Dermatology Consultation','derma',10],['Dermatologic Procedures','derma',20],
  ['Aesthetic Treatments','derma',40],
]
const mustId = value => {
  const id=Number(value)
  if (!Number.isSafeInteger(id) || id<=0) throw new Error('A valid branch ID is required.')
  return id
}

async function provisionBranch(conn, branchId, copyFromBranchId = null) {
  const id=mustId(branchId)
  const from=copyFromBranchId==null?null:mustId(copyFromBranchId)
  if (from===id) throw new Error('Cannot copy setup from the same branch.')
  await conn.query('INSERT IGNORE INTO branch_booking_settings (branch_id) VALUES (?)',[id])
  await conn.query('INSERT IGNORE INTO branch_payment_settings (branch_id,cash_enabled) VALUES (?,1)',[id])
  await conn.query('INSERT IGNORE INTO branch_receipt_sequences (branch_id,last_number) VALUES (?,0)',[id])
  for (const type of ['medical','derma']) {
    await conn.query('INSERT IGNORE INTO inventory_barcode_sequences (category,branch_id,last_number) VALUES (?,?,0)',[type,id])
  }
  for (const [name,code,order] of locationTypes) {
    await conn.query('INSERT IGNORE INTO inventory_location_types (name,code,sort_order,branch_id) VALUES (?,?,?,?)',[name,code,order,id])
  }
  for (const [name,type,isMain,clinic] of stockrooms) {
    await conn.query('INSERT IGNORE INTO inventory_locations (name,location_type,is_main_stockroom,clinic_type,branch_id) VALUES (?,?,?,?,?)',[name,type,isMain,clinic,id])
  }
  // Optional copy: source branch must be validated as active by the caller.
  if (from) {
    await conn.query(`INSERT IGNORE INTO appointment_reason_options (label,clinic_type,is_active,sort_order,branch_id)
      SELECT label,clinic_type,is_active,sort_order,? FROM appointment_reason_options WHERE branch_id=?`,[id,from])
    await conn.query(`INSERT IGNORE INTO appointment_cancellation_reasons (label,is_active,sort_order,branch_id)
      SELECT label,is_active,sort_order,? FROM appointment_cancellation_reasons WHERE branch_id=?`,[id,from])
    await conn.query(`INSERT IGNORE INTO billing_service_categories (name,clinic_type,is_active,sort_order,branch_id)
      SELECT name,clinic_type,is_active,sort_order,? FROM billing_service_categories WHERE branch_id=?`,[id,from])
    await conn.query(`INSERT IGNORE INTO billing_service_catalog
      (category_id,category,service_name,clinic_type,default_price,consultation_fee,average_duration_minutes,is_active,sort_order,profit_percentage,pricing_notes,branch_id)
      SELECT destination.id, source.category,source.service_name,source.clinic_type,source.default_price,
       source.consultation_fee,source.average_duration_minutes,source.is_active,source.sort_order,source.profit_percentage,source.pricing_notes,?
      FROM billing_service_catalog source
      LEFT JOIN billing_service_categories original ON original.id=source.category_id AND original.branch_id=?
      LEFT JOIN billing_service_categories destination ON destination.name=original.name AND destination.clinic_type=original.clinic_type AND destination.branch_id=?
      WHERE source.branch_id=?`,[id,from,id,from])
    await conn.query(`INSERT IGNORE INTO discount_presets
      (label,discount_type,value,requires_reference,requires_admin_approval,is_active,sort_order,branch_id)
      SELECT label,discount_type,value,requires_reference,requires_admin_approval,is_active,sort_order,?
      FROM discount_presets WHERE branch_id=?`,[id,from])
  } else {
    for (const [label,clinic_type,sort_order] of visitReasons)
      await conn.query('INSERT IGNORE INTO appointment_reason_options (label,clinic_type,sort_order,branch_id) VALUES (?,?,?,?)',[label,clinic_type,sort_order,id])
    for (const [label,sort_order] of cancellationReasons)
      await conn.query('INSERT IGNORE INTO appointment_cancellation_reasons (label,sort_order,branch_id) VALUES (?,?,?)',[label,sort_order,id])
    for (const [name,clinic_type,sort_order] of categories)
      await conn.query('INSERT IGNORE INTO billing_service_categories (name,clinic_type,sort_order,branch_id) VALUES (?,?,?,?)',[name,clinic_type,sort_order,id])
  }
}
module.exports={provisionBranch}
