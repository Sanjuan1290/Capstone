import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read = rel=>readFileSync(new URL(`../src/${rel}`,import.meta.url),'utf8')
test('branch form includes blank, standard, copy, preview and creation guidance',()=>{
 const src=read('pages/superAdminPage/redesign/Branches.jsx')
 for(const mode of ['blank','standard','copy']) assert.ok(src.includes(`'${mode}'`))
 assert.match(src,/Source Branch \*/)
 assert.match(src,/Setup preview:/)
 assert.match(src,/Branch Created — Complete Setup/)
 assert.match(src,/savingRef\.current/)
})
