import test from 'node:test'
import assert from 'node:assert/strict'
import {parsePrescription} from '../src/utils/prescriptionDisplay.mjs'
test('one and multiple medicines preserve separate quantity, dosage, frequency, duration and notes',()=>{
 const value=[{medicine:'Synthetic medicine',quantity:5,dosage:'10 mg',frequency:'4 times a day',duration:'3 days',notes:'As prescribed'},{medicine_name:'Second synthetic medicine',qty:2,instructions:'After meals'}]
 for(const source of [value,JSON.stringify(value),{prescriptions:value}]){const r=parsePrescription(source);assert.equal(r.kind,'items');assert.equal(r.items.length,2);assert.equal(r.items[0].quantity,'5');assert.equal(r.items[0].dosage,'10 mg');assert.equal(r.items[0].duration,'3 days');assert.equal(r.items[1].notes,'After meals')}
})
test('legacy text keeps line breaks; absent fields remain absent',()=>{assert.equal(parsePrescription('Legacy medicine\nFollow clinic instructions').text,'Legacy medicine\nFollow clinic instructions');const r=parsePrescription('[{"medicine":"Only a name"}]');assert.equal(r.items[0].frequency,'');assert.equal(r.items[0].quantity,'')})
test('null, malformed and unexpected JSON never become raw object text',()=>{
 for(const source of [null,'','null','[]'])assert.equal(parsePrescription(source).kind,'empty')
 for(const source of ['{"medicine":','{"internal":{"debug":"secret"}}','42','true','[false,{},null]']){const r=parsePrescription(source);assert.equal(r.kind,'unavailable');assert.equal(r.text,'');assert.deepEqual(r.items,[])}
 assert.equal(parsePrescription('{"medicine":"Valid single object","quantity":3}').items[0].quantity,'3')
})
