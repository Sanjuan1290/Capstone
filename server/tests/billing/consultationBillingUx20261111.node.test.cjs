const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'../../..')
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8')

test('missed online appointment message says staff contacts the patient',()=>{
 const content=read('server/utils/appointmentPolicies.js')
 assert.match(content,/Clinic staff should contact the patient to confirm their availability/)
 assert.doesNotMatch(content,/should contact the clinic before booking again/)
})
test('charge reduction panel shows preparing status and retries when bill is not yet created',()=>{
 const content=read('client/src/components/billing/DoctorChargeReductionPanel.jsx')
 assert.match(content,/Your bill is being prepared/)
 assert.match(content,/\+\+attempts<4/)
 assert.match(content,/setLoading\(true\)/)
})
test('doctor Add Service picker starts closed, and removed items have Restore',()=>{
 const content=read('client/src/pages/doctorPage/Doctor_Consultation.jsx')
 assert.match(content,/showAddService,setShowAddService\] = useState\(false\)/)
 assert.match(content,/showAddService &&/)
 assert.match(content,/restoreIncludedMaterial\(/)
 assert.match(content,/removed \? <button/)
 assert.match(content,/>Restore</)
 assert.match(content,/Service breakdown/)
})
test('admin and staff show pending billing counts in navigation',()=>{
 for(const name of ['AdminLayout.jsx','StaffLayout.jsx']){
  const content=read(`client/src/components/layouts/${name}`)
  assert.match(content,/pendingBilling/)
  assert.match(content,/badge: 'billing'/)
  assert.match(content,/loadBillingCount/)
 }
})
test('checkout uses service price and item price labels',()=>{
 for(const name of ['adminPage/Admin_CheckoutDetail.jsx','staffPage/Staff_CheckoutDetail.jsx']){
  const content=read(`client/src/pages/${name}`)
  assert.match(content,/Service Price/)
  assert.match(content,/Item Price/)
 }
 assert.match(read('client/src/components/billing/CheckoutSupplyEditor.jsx'),/Item Price/)
})
test('staff and admin checkout support a branch catalog service and its promotion',()=>{
 for(const name of ['adminPage/Admin_CheckoutDetail.jsx','staffPage/Staff_CheckoutDetail.jsx']){
  const content=read(`client/src/pages/${name}`)
  assert.match(content,/CheckoutServiceEditor/)
  assert.match(content,/getBillingPromotionOptions/)
  assert.match(content,/staff_service/)
 }
})
