import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read = rel=>readFileSync(new URL(`../src/${rel}`,import.meta.url),'utf8')
import {selectRearCamera} from '../src/utils/scannerCamera.mjs'
test('rear device is preferred over front-facing camera',()=>{
 const devices=[{deviceId:'selfie',label:'Front Camera'}, {deviceId:'back',label:'Camera Back'}]
 assert.equal(selectRearCamera(devices,'selfie'),'back')
 assert.equal(selectRearCamera([{deviceId:'only',label:''}]),'only')
 assert.equal(selectRearCamera([]),'')
})
test('scanner requests environment camera and retains manual/image recovery',()=>{
 const src=read('pages/shared/Inventory.jsx')
 assert.match(src,/getUserMedia\(\{ video: \{ facingMode: \{ ideal: 'environment'/)
 assert.match(src,/selectRearCamera\(availableDevices, capturedId\)/)
 assert.match(src,/Manual Barcode/)
 assert.match(src,/Scan Barcode Image/)
 assert.match(src,/capabilities\.focusMode/)
})
