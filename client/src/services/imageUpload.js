export async function uploadValidatedImage(file,url,{onStatus,maxBytes=5*1024*1024}={}){
 if(!file||!['image/png','image/jpeg'].includes(String(file.type||'').toLowerCase()))throw new Error('Select a PNG or JPG image.')
 if(!file.size||file.size>maxBytes)throw new Error(`Image must be ${maxBytes/1024/1024} MB or smaller.`)
 onStatus?.({phase:'uploading',tone:'info',message:'Uploading image...'})
 const response=await fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':file.type,'X-File-Name':file.name||'image'},body:file})
 let data={};try{data=await response.json()}catch{ /* Report an incomplete upload response below. */ }
 if(!response.ok)throw Object.assign(new Error(data.message||'Image upload failed. Try again.'),data)
 if(!data.url||!data.security_token)throw new Error('The server did not return upload authorization. Try uploading again.')
 onStatus?.({phase:'uploaded',tone:'success',message:'Upload complete.'})
 return data
}
