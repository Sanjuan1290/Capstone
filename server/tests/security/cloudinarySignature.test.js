const cloud=require('../../utils/cloudinarySecurity')
describe('Cloudinary image validation and upload authorization',()=>{
 beforeEach(()=>{
  process.env.CLOUDINARY_CLOUD_NAME='test-cloud';process.env.CLOUDINARY_API_KEY='test-key';process.env.CLOUDINARY_API_SECRET='test-secret';process.env.JWT_SECRET='test-jwt-secret-that-is-long-enough'
 })
 afterEach(()=>vi.restoreAllMocks())
 const png=()=>Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])
 const result=()=>({asset_id:'asset-1',secure_url:'https://res.cloudinary.com/test-cloud/image/upload/test.png',public_id:'folder/test',resource_type:'image',bytes:12})
 it('creates branch-scoped clinical and payment signatures without exposing secrets or adding moderation',()=>{
  const clinical=cloud.createClinicalUploadSignature({doctorId:4,patientId:3,appointmentId:19,branchId:2}),qr=cloud.createPaymentQrUploadSignature({actorId:4,provider:'gcash',branchId:2})
  for(const signed of [clinical,qr]){expect(signed.folder).toContain('branch_2');expect(signed.signature).toMatch(/^[a-f0-9]{40}$/);expect(signed.moderation).toBeUndefined();expect(signed.scan_mode).toBeUndefined();expect(signed.api_secret).toBeUndefined()}
  expect(cloud.createPaymentQrUploadSignature({actorId:4,provider:'gcash',branchId:2}).public_id).not.toBe(qr.public_id)
 })
 it('retains deterministic signatures and validates payment QR providers',()=>{
  expect(cloud.makeCloudinarySignature({folder:'a',timestamp:123},'secret')).toBe(cloud.makeCloudinarySignature({timestamp:123,folder:'a'},'secret'))
  expect(()=>cloud.createPaymentQrUploadSignature({actorId:1,provider:'invalid',branchId:1})).toThrow(/GCash or Maya/)
 })
 it('validates image signatures, rejects unsupported files and enforces file-size limits before a provider call',async()=>{
  const spy=vi.spyOn(global,'fetch'),signed=cloud.createImageUploadSignature({folder:'test'})
  expect(cloud.detectImageMime(png())).toBe('image/png')
  await expect(cloud.cloudinaryUploadBuffer({buffer:Buffer.from('<script>unsafe</script>'),mimeType:'image/png',signed})).rejects.toMatchObject({statusCode:400})
  await expect(cloud.cloudinaryUploadBuffer({buffer:Buffer.alloc(5*1024*1024+1),mimeType:'image/png',signed})).rejects.toMatchObject({statusCode:413})
  expect(spy).not.toHaveBeenCalled()
 })
 it('uploads to Cloudinary once without polling, approval flags or scanner parameters',async()=>{
  const spy=vi.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>result()})
  await cloud.cloudinaryUploadBuffer({buffer:png(),mimeType:'image/png',signed:cloud.createImageUploadSignature({folder:'test'})})
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload')
  const body=spy.mock.calls[0][1].body;expect(body.has('moderation')).toBe(false);expect(body.has('signature')).toBe(true)
 })
 it('keeps the larger existing clinical limit while other uploads retain 5 MB',async()=>{
  const buffer=Buffer.concat([png(),Buffer.alloc(6*1024*1024)]),signed=cloud.createImageUploadSignature({folder:'clinical'})
  vi.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({...result(),bytes:buffer.length})})
  await expect(cloud.cloudinaryUploadBuffer({buffer,mimeType:'image/png',signed,maxBytes:10*1024*1024})).resolves.toHaveProperty('asset_id','asset-1')
  await expect(cloud.cloudinaryUploadBuffer({buffer,mimeType:'image/png',signed})).rejects.toMatchObject({statusCode:413})
 })
 it('provider failures and wrong-host responses are surfaced as upload errors',async()=>{
  const spy=vi.spyOn(global,'fetch').mockResolvedValue({ok:false,status:500,json:async()=>({error:{message:'Upload unavailable'}})})
  const input={buffer:png(),mimeType:'image/png',signed:cloud.createImageUploadSignature({folder:'test'})}
  await expect(cloud.cloudinaryUploadBuffer(input)).rejects.toMatchObject({statusCode:502})
  spy.mockResolvedValue({ok:true,json:async()=>({...result(),secure_url:'https://attacker.invalid/image.png'})})
  await expect(cloud.cloudinaryUploadBuffer(input)).rejects.toMatchObject({statusCode:502})
 })
 it('authorization binds role, account, physical branch, context, asset and URL for every protected flow',()=>{
  for(const contextType of ['clinical','payment_qr','discount_proof','promotion','announcement']){
   const token=cloud.issueAcceptedUploadToken({role:'doctor',userId:7,branchId:1,contextType,contextId:31,assetId:'asset-31',url:'https://res.cloudinary.com/test-cloud/image/upload/image.png'})
   const accepted=cloud.verifyUploadSecurityToken(token,{stage:'accepted',validation:'image_validated',role:'doctor',user_id:7,branch_id:1,context_type:contextType,context_id:31})
   expect(accepted.validation).toBe('image_validated')
   for(const expected of [{branch_id:2},{user_id:8},{role:'admin'},{context_id:99},{context_type:'other'},{asset_id:'other'},{url:'https://attacker.invalid/image.png'}])expect(()=>cloud.verifyUploadSecurityToken(token,expected)).toThrow(/does not match/)
   expect(()=>cloud.verifyUploadSecurityToken(token+'tampered')).toThrow(/invalid or expired/)
  }
 })
})
