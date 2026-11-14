import test from 'node:test'
import assert from 'node:assert/strict'
import {uploadValidatedImage} from '../src/services/imageUpload.js'
const png=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'synthetic.png',{type:'image/png'})
test('validated image upload sends the raw file once with session credentials and retains authorization',async t=>{
 const phases=[],file=png(),fetch=t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({url:'https://res.cloudinary.com/qa/image/upload/test.png',security_token:'signed-token'})}))
 const result=await uploadValidatedImage(file,'/api/doctor/uploads/clinical?appointment_id=9',{onStatus:status=>phases.push(status.phase)})
 assert.equal(result.security_token,'signed-token');assert.deepEqual(phases,['uploading','uploaded'])
 assert.equal(fetch.mock.calls.length,1);assert.equal(fetch.mock.calls[0].arguments[1].body,file)
 assert.equal(fetch.mock.calls[0].arguments[1].credentials,'include')
})
test('unsupported, empty or oversized images fail before an upload request',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>{throw Error('Must not call provider')})
 for(const file of [new File(['text'],'text.txt',{type:'text/plain'}),new File([],'empty.png',{type:'image/png'}),new File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'})])await assert.rejects(uploadValidatedImage(file,'/api/upload'))
 assert.equal(fetch.mock.calls.length,0)
})
test('failed or unauthorized upload responses do not attach an image',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>({ok:false,json:async()=>({message:'Not authorized for this branch'})}))
 await assert.rejects(uploadValidatedImage(png(),'/api/upload'),/Not authorized for this branch/)
 fetch.mock.mockImplementation(async()=>({ok:true,json:async()=>({url:'https://res.cloudinary.com/qa/image/upload/image.png'})}))
 await assert.rejects(uploadValidatedImage(png(),'/api/upload'),/did not return upload authorization/)
})
