import test from 'node:test'
import assert from 'node:assert/strict'
import {estimateConsultationServicePrice} from '../src/utils/consultationPricing.mjs'
const catalog={default_price:455,consultation_fee:350,materials:[{inventory_id:7,quantity:1},{inventory_id:8,quantity:1}]}
const inv=[{id:7,selling_price:40},{id:8,selling_price:65},{id:9,selling_price:80}]
const svc=materials=>({materials})
test('unchanged materials keep saved standard total',()=>assert.equal(estimateConsultationServicePrice(svc([{inventory_id:7,quantity:1},{inventory_id:8,quantity:1}]),catalog,inv),455))
test('substitution calculates new patient total',()=>assert.equal(estimateConsultationServicePrice(svc([{inventory_id:7,quantity:1},{inventory_id:9,quantity:1}]),catalog,inv),470))
test('unused removed material is excluded',()=>assert.equal(estimateConsultationServicePrice(svc([{inventory_id:7,quantity:1}]),catalog,inv),390))
test('additional consumable is charged once',()=>assert.equal(estimateConsultationServicePrice(svc([{inventory_id:7,quantity:1},{inventory_id:8,quantity:1},{inventory_id:8,quantity:1,consultation_extra:true}]),catalog,inv),520))
test('unknown product cannot produce an invented price',()=>assert.equal(estimateConsultationServicePrice(svc([{inventory_id:7,quantity:1},{inventory_id:99,quantity:1}]),catalog,inv),null))
