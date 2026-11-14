// Test-only preload: fail any unmocked external connection before it can leave this machine.
const net=require('node:net')
const connect=net.Socket.prototype.connect
net.Socket.prototype.connect=function(...args){
 const first=Array.isArray(args[0])?args[0][0]:args[0]
 const host=typeof first==='object'?(first.host||first.hostname||'localhost'):typeof args[1]==='string'?args[1]:'localhost'
 if(!['localhost','127.0.0.1','::1','0.0.0.0','::'].includes(host))throw Error('QA blocks external network connections. Mock the provider or database.')
 return connect.apply(this,args)
}
const nativeFetch=globalThis.fetch
globalThis.fetch=async function(input,...args){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('QA blocks unmocked external fetch requests.')
 return nativeFetch.call(this,input,...args)
}
