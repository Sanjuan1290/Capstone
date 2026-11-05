// Reuse the same key when a payment response is lost. A new balance or changed
// payment form represents a new collection, and receives a new key.
export function paymentRequestKey(storage, storageKey, signature, createKey) {
 try {
  const previous=JSON.parse(storage.getItem(storageKey)||'null')
  if(previous?.signature===signature&&typeof previous.key==='string')return previous.key
 } catch { /* Storage may be disabled; callers also retain an in-memory key. */ }
 const key=createKey()
 try{storage.setItem(storageKey,JSON.stringify({signature,key}))}catch{}
 return key
}
