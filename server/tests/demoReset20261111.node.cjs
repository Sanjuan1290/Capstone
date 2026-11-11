const test=require('node:test')
const assert=require('node:assert/strict')
const { CLEAR_TABLES, orderChildrenFirst } = require('../scripts/resetDemoData')

test('demo reset clears temporary visits and stock history without erasing clinic setup', () => {
  for(const table of ['patients','appointments','consultations','billing_records','billing_payments','inventory_location_stock','inventory_batches','clinical_inventory_reservations','queue'])assert.ok(CLEAR_TABLES.includes(table),table)
  for(const table of ['admins','staff','doctors','clinic_branches','clinic_settings','booking_settings','inventory','inventory_locations','billing_service_catalog','billing_service_materials','schema_migrations','system_doctor_confirmation_notifications','billing_receipt_sequence','branch_receipt_sequences','inventory_barcode_sequences']) assert.ok(!CLEAR_TABLES.includes(table),table)
})

test('delete order places each FK child before its parent', () => {
  const tables=['patients','appointments','consultations','billing_records','billing_items']
  const refs=[
    {TABLE_NAME:'appointments',REFERENCED_TABLE_NAME:'patients'},
    {TABLE_NAME:'consultations',REFERENCED_TABLE_NAME:'appointments'},
    {TABLE_NAME:'billing_records',REFERENCED_TABLE_NAME:'consultations'},
    {TABLE_NAME:'billing_items',REFERENCED_TABLE_NAME:'billing_records'},
  ]
  const order=orderChildrenFirst(tables,refs)
  for(const ref of refs)assert.ok(order.indexOf(ref.TABLE_NAME)<order.indexOf(ref.REFERENCED_TABLE_NAME),`${ref.TABLE_NAME} before ${ref.REFERENCED_TABLE_NAME}`)
})
