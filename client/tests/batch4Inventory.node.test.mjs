import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read = rel=>readFileSync(new URL(`../src/${rel}`,import.meta.url),'utf8')
test('mobile Add Medicine dialog has accessible scrolling and preserves old Supplies',()=>{
 const src=read('pages/shared/Inventory.jsx')
 assert.match(src,/max-h-\[calc\(100dvh-1rem\)\]/)
 assert.match(src,/min-h-0 flex-1 overflow-y-auto/)
 assert.doesNotMatch(src,/Field label="Type \*"/)
 assert.match(src,/item_type: isEditing \? form.item_type : 'medicine'/)
 assert.match(src,/Existing supply item — type preserved/)
})
