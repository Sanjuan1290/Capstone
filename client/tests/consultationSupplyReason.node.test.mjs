import test from 'node:test'
import assert from 'node:assert/strict'
import {restoreConsultationServicesFromBilling, supplyReasonStatus} from '../src/utils/consultationSupplyReason.mjs'
import {createConsultationDraftQueue} from '../src/utils/consultationDraftQueue.js'

const configured = {materials:[{inventory_id:7,quantity:1},{inventory_id:8,quantity:1}]}
const patientSpecific = {catalog_service_id:77,materials:[{inventory_id:7,quantity:1},{inventory_id:9,quantity:1}],usage_change_reason:''}

test('original service supplies do not need a change reason',()=>{
  assert.deepEqual(supplyReasonStatus({materials: configured.materials},configured),{required:false,valid:true,remaining:0})
})
test('replaced or removed supplies may omit a reason',()=>{
  assert.equal(supplyReasonStatus(patientSpecific,configured).valid,true)
  assert.equal(supplyReasonStatus({...patientSpecific,usage_change_reason:'Other clinically suitable supply.'},configured).valid,true)
  assert.equal(supplyReasonStatus({materials:[{inventory_id:7,quantity:1}]},configured).required,false)
  assert.equal(supplyReasonStatus({...patientSpecific,usage_change_reason:'abc'},configured).valid,false)
})
test('extra supply allows a blank reason, but rejects a short nonempty reason',()=>{
  const newItem={materials:[{inventory_id:12,quantity:1,consultation_extra:true}],usage_change_reason:''}
  assert.equal(supplyReasonStatus(newItem,{materials:[]}).required,false)
  assert.equal(supplyReasonStatus(newItem,{materials:[]}).valid,true)
  assert.equal(supplyReasonStatus({...newItem,usage_change_reason:'abc'},{materials:[]}).valid,false)
  assert.equal(supplyReasonStatus({...newItem,usage_change_reason:'Used an additional syringe.'},{materials:[]}).valid,true)
})
test('draft reload restores extras from billing supply lines and keeps reason',()=>{
  const items=[
    {item_type:'service',catalog_service_id:77,service_name:'Wound Dressing',quantity:1,details_json:JSON.stringify({materials:[{inventory_id:7,quantity:1,unit_label:'unit'}],usage_change_reason:'Additional syringe required.',usage_overridden:false})},
    {item_type:'supply',source_type:'consultation_extra',catalog_service_id:77,source_inventory_id:12,service_name:'Syringe 1mL',quantity:2,details_json:JSON.stringify({consultation_extra:true,parent_catalog_service_id:77,unit:'unit'})}
  ]
  const restored=restoreConsultationServicesFromBilling(items)
  assert.equal(restored.length,1)
  assert.equal(restored[0].usage_change_reason,'Additional syringe required.')
  assert.deepEqual(restored[0].materials.map(i=>i.inventory_id),[7,12])
  assert.equal(restored[0].materials[1].consultation_extra,true)
  assert.equal(restored[0].materials[1].quantity,2)
  assert.equal(supplyReasonStatus(restored[0],{materials:[{inventory_id:7,quantity:1}]}).valid,true)
})
test('deduplicates historical embedded extra and separate extra billing row',()=>{
  const items=[{item_type:'service',catalog_service_id:77,details_json:{materials:[{inventory_id:12,quantity:2,consultation_extra:true}]}},
    {item_type:'supply',source_type:'consultation_extra',catalog_service_id:77,source_inventory_id:12,quantity:2}]
  assert.equal(restoreConsultationServicesFromBilling(items)[0].materials.length,1)
})
test('does not attach an unrelated extra to another service',()=>{
  const items=[{item_type:'service',catalog_service_id:77,details_json:'{}'},
    {item_type:'service',catalog_service_id:88,details_json:'{}'},
    {item_type:'supply',source_type:'consultation_extra',catalog_service_id:99,source_inventory_id:12,quantity:1}]
  assert.deepEqual(restoreConsultationServicesFromBilling(items).map(s=>s.materials.length),[0,0])
})

test('previously blocked draft can be retried after the reason is entered',async()=>{
  let last = {appointmentId:22, signature:'missing', payload:{billable_services:[{usage_change_reason:''}]}}
  const seen=[]
  const queue=createConsultationDraftQueue({
    saveDraft:async(id,payload)=>{
      const reason=payload.billable_services[0].usage_change_reason
      if(!reason) throw Object.assign(new Error('Enter a reason (5–255 characters) when changing or adding supplies.'),{code:'SUPPLY_CHANGE_REASON_REQUIRED',httpStatus:400})
      seen.push([id,reason]); return {id}
    },
    getAppointmentId:()=>22,
    getLatestDraft:()=>last
  })
  assert.equal(await queue.persist(),false)
  assert.equal(queue.isBlocked(),true)
  last={appointmentId:22,signature:'valid',payload:{billable_services:[{usage_change_reason:'Extra syringe was used.'}]}}
  assert.equal(await queue.retryBlocked(),true)
  assert.equal(queue.isBlocked(),false)
  assert.deepEqual(seen,[[22,'Extra syringe was used.']])
})

