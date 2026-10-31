import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { inflateRaw } from '../src/vendor/pakoInflate.mjs'
import { readInventoryFile, makeInventoryXlsx, INVENTORY_HEADERS } from '../src/utils/inventoryExcel.mjs'

test('Excel raw DEFLATE files can decompress without browser DecompressionStream', () => {
  const text = '<worksheet><sheetData>Sample XML</sheetData></worksheet>'
  const compressed = deflateRawSync(Buffer.from(text))
  assert.equal(new TextDecoder().decode(inflateRaw(compressed)), text)
})

test('CSV template accepts item fields and preserves spreadsheet row numbers', async () => {
  const content = INVENTORY_HEADERS.join(',') + '\nTest Soap,199,0,10,2027-11-01,General Medicine,Main Stock Room,5,Test Supplier\n'
  const file = new File([content], 'inventory.csv', { type:'text/csv' })
  const rows = await readInventoryFile(file)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]['Item Name'], 'Test Soap')
  assert.equal(rows[0]._excelRow, 2)
})

test('Invalid spreadsheet identifies missing columns', async () => {
  const file = new File(['Item Name,Quantity\nSoap,1\n'], 'wrong.csv')
  await assert.rejects(readInventoryFile(file), /Missing columns:.*selling price.*stock room/i)
})

test('Download Excel template produces ZIP workbook', async () => {
  const file = makeInventoryXlsx([])
  const buffer = Buffer.from(await file.arrayBuffer())
  assert.equal(buffer.toString('ascii',0,2), 'PK')
})
