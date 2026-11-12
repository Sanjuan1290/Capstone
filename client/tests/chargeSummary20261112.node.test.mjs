import test from 'node:test'
import assert from 'node:assert/strict'
import {chargeSummaryLines} from '../src/utils/chargeSummary.mjs'
test('lists services, included supplies, extra medicine and custom charges without double counting',()=>{
 const lines=chargeSummaryLines([
  {service_name:'Consultation',source_type:'consultation',quantity:1,unit_price:540,details:JSON.stringify({materials:[{material_name:'Gauze',quantity:1,charge_unit_price:190}]})},
  {service_name:'Extra medicine',item_type:'supply',source_type:'consultation_extra',quantity:2,unit_price:10},
  {service_name:'Additional charge',item_type:'custom',quantity:1,unit_price:30},
 ])
 assert.deepEqual(lines.map(l=>l.total),[540,20,30])
 assert.equal(lines.reduce((sum,line)=>sum+line.total,0),590)
 assert.equal(lines[0].includedItems[0].total,190)
 assert.equal(lines[0].servicePortion,350)
 assert.deepEqual(lines.map(l=>l.type),['Service','Item / medicine','Additional charge'])
})
test('changed actual included quantities use price snapshots, never default quantities or zero-valued stock costs',()=>{
 const [line]=chargeSummaryLines([{service_name:'Treatment',quantity:2,unit_price:100,details:{materials:[{material_name:'Supply',quantity:3,charge_quantity:1,charge_unit_price:5,charge_total:5,line_total:0}]}}])
 assert.equal(line.total,200);assert.equal(line.includedItems[0].quantity,6);assert.equal(line.includedItems[0].total,30)
})
test('old bills without a price snapshot show item names and quantity without inventing a charge',()=>{
 const [line]=chargeSummaryLines([{quantity:1,unit_price:50,details:{materials:[{material_name:'Legacy',quantity:2,line_total:0}]}}])
 assert.equal(line.includedItems[0].name,'Legacy');assert.equal(line.includedItems[0].total,null)
 assert.equal(chargeSummaryLines([{quantity:1,unit_price:50,details:'broken JSON'}])[0].total,50)
})
