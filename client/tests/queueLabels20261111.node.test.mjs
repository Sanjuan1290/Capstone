import test from 'node:test'
import assert from 'node:assert/strict'
import { formatQueueLabel } from '../src/utils/queueLabel.mjs'

test('queue labels show doctor + clinic without changing stored queue number', () => {
 assert.equal(formatQueueLabel({ queueNo:1,type:'medical',doctorId:11 }),'MED-D11-001')
 assert.equal(formatQueueLabel({ queue_number:1,type:'derma',doctor_id:22 }),'DER-D22-001')
 assert.notEqual(formatQueueLabel({queueNo:1,type:'medical',doctorId:11}),formatQueueLabel({queueNo:1,type:'medical',doctorId:22}))
})
test('invalid queue number does not show a fake patient', () => {
 assert.equal(formatQueueLabel({queue_number:-1,type:'derma'}),'—')
 assert.equal(formatQueueLabel({queue_number:'x'}),'—')
})
