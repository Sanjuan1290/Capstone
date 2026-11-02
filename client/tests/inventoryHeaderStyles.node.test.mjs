import test from 'node:test'
import assert from 'node:assert/strict'
import {INVENTORY_BULK_EDIT_HEADERS,INVENTORY_HEADERS,INVENTORY_NEW_ITEM_HEADERS,makeInventoryNewItemsTemplate,makeInventoryXlsx} from '../src/utils/inventoryExcel.mjs'

const unzipText = async blob => new TextDecoder().decode(await blob.arrayBuffer())

for (const [name,produce,headers] of [
  ['new-item template',()=>makeInventoryNewItemsTemplate({stockRooms:[{id:1,name:'Main Stockroom'}],suppliers:[{id:1,name:'Sample Supplier'}]}),INVENTORY_NEW_ITEM_HEADERS],
  ['editable export',()=>makeInventoryXlsx([],INVENTORY_BULK_EDIT_HEADERS,{styled:true}),INVENTORY_BULK_EDIT_HEADERS],
  ['read-only report',()=>makeInventoryXlsx([],INVENTORY_HEADERS,{styled:true,readOnly:true}),INVENTORY_HEADERS],
]) {
  test(`${name}: readable Excel headers use custom fill #2 after two reserved fills`, async()=>{
    const s = await unzipText(produce())
    assert.match(s, /<fills count="3"><fill><patternFill patternType="none"\/><\/fill><fill><patternFill patternType="gray125"\/><\/fill><fill><patternFill patternType="solid">/)
    assert.match(s, /<fgColor rgb="FF183153"\/>/)
    assert.match(s, /<color rgb="FFFFFFFF"\/>/)
    assert.match(s, /<xf numFmtId="0" fontId="1" fillId="2"/)
    assert.doesNotMatch(s, /fontId="1" fillId="1"/)
    assert.match(s, /<row r="1" ht="34" customHeight="1">/)
    assert.match(s, /<cellStyle name="Normal" xfId="0" builtinId="0"\/>/)
    for(const header of headers) assert.ok(s.includes(`<t xml:space="preserve">${header}</t>`),`header ${header} missing`)
  })
}
