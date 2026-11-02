import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=(name)=>readFileSync(resolve(root,`src/${name}`),'utf8')
const room=source('components/system/StockRoomsManager.jsx')
const actions=source('components/system/SetupTableActions.jsx')
const tabs=source('components/system/SystemSetupTabs.jsx')
const reference=source('pages/adminPage/Admin_SystemSetup.jsx')
const visits=source('pages/adminPage/Admin_PatientBooking.jsx')
const service=source('pages/adminPage/Admin_BillingCatalog.jsx')

test('Stock Rooms has a product count label, not a unit count column',()=>{
  assert.match(room,/>Products in Room<\/th>/)
  assert.match(room,/row\.item_count/)
  assert.doesNotMatch(room,/row\.total_quantity/)
  assert.doesNotMatch(room,/>Stock<\/th>/)
  assert.match(room,/Each product counts once/)
})
test('All seven System Setup sections remain available and tabs are scrollable on smaller screens',()=>{
  for(const tab of ['visits','cancellation_reasons','billing_setup','service_categories','suppliers','stock_rooms','movement_reasons'])
    assert.match(tabs,new RegExp(`key: '${tab}'`))
  assert.match(tabs,/overflow-x-auto/)
  assert.match(tabs,/shrink-0/)
  assert.match(tabs,/aria-current/)
})
test('Stock Rooms actions have two fixed slots, even when a room only supports Edit',()=>{
  assert.match(actions,/grid-cols-\[88px_136px\]/)
  assert.match(actions,/secondary \|\| <span aria-hidden="true"/)
  assert.match(room,/is_main_stockroom/)
  assert.match(room,/SETUP_ACTION_CELL/)
  assert.match(room,/SetupTableActions/)
})
test('Shared fixed-width action slots are used across System Setup tables and lists',()=>{
  for(const [name,ui] of [['ReferenceManager',reference],['Patient Visits',visits],['Services & Pricing',service]]){
    assert.match(ui,/SetupTableActions/,name)
    assert.match(ui,/SETUP_ACTION_BUTTON/,name)
  }
  for(const type of ['cancellation_reasons','service_categories','suppliers','movement_reasons'])
    assert.match(reference,new RegExp(type))
  assert.match(reference,/min-w-\[1160px\]/)
  assert.match(service,/min-w-\[1130px\]/)
  assert.match(visits,/sm:flex-row sm:items-center/)
})
test('Removal and management operations are unchanged by presentation updates',()=>{
  for(const token of ['deleteInventoryLocation','updateInventoryLocation','createInventoryLocation']) assert.match(room,new RegExp(token))
  for(const token of ['deleteBillingServiceCategory','deleteInventorySupplier','deleteInventoryMovementReason','saveAppointmentCancellationReason']) assert.match(reference,new RegExp(token))
  assert.match(service,/deleteBillingCatalogService/)
  assert.match(visits,/deleteAppointmentReason/)
})
