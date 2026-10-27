import test from 'node:test'
import assert from 'node:assert/strict'
import {visiblePromotions} from '../src/utils/promotionPresentation.mjs'
import {normalizeClinicEvent,clinicEventAffects,sameActiveBranch} from '../src/utils/clinicLiveEvents.mjs'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
test('featured offers show at most three in stable order and exclude disabled dashboard flags',()=>{
 const source=[{id:1,featured_order:4,show_on_dashboard:true},{id:2,featured_order:2,show_on_dashboard:true},{id:3,featured_order:3,show_on_dashboard:false},{id:4,featured_order:1,show_on_dashboard:true},{id:5,featured_order:6,show_on_dashboard:true},{id:6,is_active:false,featured_order:0,show_on_dashboard:true}]
 assert.deepEqual(visiblePromotions(source,true).map(x=>x.id),[4,2,1]);assert.equal(visiblePromotions(source).length,5);assert.deepEqual(source.map(x=>x.id),[1,2,3,4,5,6])
})
test('API active-only offers without an is_active field remain visible but explicit database 0 is hidden',()=>{
 const rows=[{id:11,featured_order:2,show_on_dashboard:true},{id:12,is_active:0,featured_order:0,show_on_dashboard:true},{id:13,is_active:'0',featured_order:1,show_on_dashboard:true},{id:14,is_active:1,featured_order:3,show_on_dashboard:true}]
 assert.deepEqual(visiblePromotions(rows,true).map(p=>p.id),[11,14])
 assert.deepEqual(rows.map(p=>p.id),[11,12,13,14])
})
test('legacy SSE event names map to module change subjects',()=>{
 assert.equal(normalizeClinicEvent('appointment_updated'),'appointment.updated');assert.equal(normalizeClinicEvent('billing_paid'),'billing.updated');assert.equal(normalizeClinicEvent('inventory_updated'),'inventory.updated');assert.equal(normalizeClinicEvent('promotion.updated'),'promotion.updated')
 assert.equal(clinicEventAffects('queue_updated',['queue.updated']),true)
 assert.equal(clinicEventAffects('stream.reconnected',[]),true)
 assert.equal(clinicEventAffects('billing_paid',['inventory.updated']),false)
})
test('selected Super Admin branch ignores another branch event',()=>{
 assert.equal(sameActiveBranch({branch_id:2},'/superadmin/branches/1/inventory'),false)
 assert.equal(sameActiveBranch({branch_id:1},'/superadmin/branches/1/inventory'),true)
 assert.equal(sameActiveBranch({branch_id:2},'/admin/inventory'),true)
})
test('promotions require accepted, branch-owned upload token, not arbitrary image URLs',()=>{
 const source=read('../../server/routers/branchPromotions.js')
 for(const marker of ["scan_status:'approved'","context_type:'promotion'",'context_id:req.branchId','Upload and approve the promotional image','cloud.getPerceptionPointScanStatus',"requirePermission('system_setup')"])assert.ok(source.includes(marker),marker)
})
test('patient offers have a registered route and frontend image does not alter billing',()=>{
 const routes=read('../src/App.jsx'), cards=read('../src/components/promotions/PromotionCards.jsx')
 assert.match(routes,/path='offers'\s+element=\{<PatientOffers\s*\/>\}/)
 assert.match(cards,/image_url/)
 assert.doesNotMatch(cards,/discount_amount|billing_payments/)
})


