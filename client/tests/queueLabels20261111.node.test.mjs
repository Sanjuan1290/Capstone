import test from 'node:test'
import assert from 'node:assert/strict'
import { formatQueueLabel } from '../src/utils/queueLabel.mjs'

test('queue labels show clinic and daily number without doctor IDs', () => {
 assert.equal(formatQueueLabel({ queueNo:1,type:'medical',doctorId:11 }),'MED-001')
 assert.equal(formatQueueLabel({ queue_number:1,type:'derma',doctor_id:22 }),'DER-001')
 assert.equal(formatQueueLabel({queueNo:1,type:'medical',doctorId:11}),formatQueueLabel({queueNo:1,type:'medical',doctorId:22}))
})
test('invalid queue number does not show a fake patient', () => {
 assert.equal(formatQueueLabel({queue_number:-1,type:'derma'}),'—')
 assert.equal(formatQueueLabel({queue_number:'x'}),'—')
})
