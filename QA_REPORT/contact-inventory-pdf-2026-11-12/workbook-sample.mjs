import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { makeSuperAdminInventoryReport } from '../../client/src/utils/superAdminInventoryReport.mjs'

export const sampleInventory = {
  branches: [{ id: 1, name: 'Synthetic Laguna' }, { id: 2, name: 'Synthetic Manila' }],
  rows: [
    { id: 101, branch_id: 1, branch_name: 'Synthetic Laguna', name: 'Medicine & Supplies', barcode: '00000101', category: 'medical', item_type: 'medicine', quantity_base: 3, base_unit: 'unit', selling_price: 25.5, unit: 'unit', selling_value: 76.5, threshold: 5, low: true, nearest_expiry: '2026-11-20', expiring: true },
    { id: 102, branch_id: 2, branch_name: 'Synthetic Manila', name: 'Skin Cream', barcode: '00000102', category: 'derma', item_type: 'medicine', quantity_base: 0, base_unit: 'unit', selling_price: 650, unit: 'unit', selling_value: 0, threshold: 2, out: true, nearest_expiry: null },
  ],
  summary: { total_items: 2, total_selling_value: 76.5, low_stock: 1, out_of_stock: 1 },
  comparison: [
    { branch_name: 'Synthetic Laguna', item_count: 1, low_stock: 1, out_of_stock: 0, expiring: 1, expired: 0, selling_value: 76.5 },
    { branch_name: 'Synthetic Manila', item_count: 1, low_stock: 0, out_of_stock: 1, expiring: 0, expired: 0, selling_value: 0 },
  ],
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const filename = process.argv[2] || 'inventory-corrected.xlsx'
  const blob = makeSuperAdminInventoryReport(sampleInventory, { generatedAt: new Date('2026-11-12T12:00:00Z') })
  await writeFile(new URL(filename, import.meta.url), Buffer.from(await blob.arrayBuffer()))
  console.log(filename)
}
