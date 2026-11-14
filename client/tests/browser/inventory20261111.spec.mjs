import { test, expect } from '@playwright/test'
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatReader } from '@zxing/library'
import { mockClinic } from './helpers/clinic20261111.mjs'

const referenceTime = new Date('2026-11-11T04:00:00Z')
const product = (id, name, overrides = {}) => ({
  id, name, branch_id: 1, category: 'medical', item_type: 'medicine',
  stock: 17, stock_base: 17, threshold: 5, selling_price: 650,
  default_location_id: 1, supplier_id: 17, supplier: 'Synthetic supplier',
  barcode: `GMED-BR-5881E4C8A3BDA1A7-${String(id).padStart(5, '0')}`,
  expiration_date: '2028-11-11', batches: [], ...overrides,
})

async function inventoryPortal(page, role = 'admin') {
  await page.clock.setFixedTime(referenceTime)
  const { root } = await mockClinic(page, role)
  const state = { edits: [], creates: [], items: [
    product(1, 'Normal medicine'),
    product(2, 'Low medicine', { stock: 5, stock_base: 5 }),
    product(3, 'Empty medicine', { stock: 0, stock_base: 0 }),
    product(4, 'Expiring medicine', { category: 'derma', expiration_date: '2026-11-01', default_location_id: 2, batches: [
      { id: 40, batch_code: 'OLD-BARCODE-B001', quantity: 2, expiration_date: '2026-11-01' },
      { id: 41, batch_code: 'B4-001', quantity: 15, expiration_date: '2026-12-11' },
    ] }),
    product(5, 'Depleted batch medicine', { batches: [{ id: 50, quantity: 0, expiration_date: '2026-12-01' }] }),
    product(6, 'Reserved medicine', { available_stock: 0 }),
    product(7, 'Another low medicine', { category: 'derma', stock: 3, stock_base: 3, default_location_id: 2 }),
  ] }
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (/\/inventory\/\d+$/.test(path) && req.method() === 'PUT') {
      const body = req.postDataJSON()
      state.edits.push(body)
      if ('stock' in body || 'stock_base' in body) return route.fulfill({ status: 400, json: { message: 'Use Stock In or Stock Out to change quantities.' } })
      const row = state.items.find(item => item.id === Number(path.split('/').at(-1)))
      Object.assign(row, body)
      return route.fulfill({ json: row })
    }
    if (path.endsWith('/inventory') && req.method() === 'POST') {
      const body = req.postDataJSON()
      state.creates.push(body)
      const row = product(8, body.name, { ...body, barcode: 'M1-00008', stock_base: body.stock })
      state.items.push(row)
      return route.fulfill({ status: 201, json: row })
    }
    if (path.endsWith('/inventory')) return route.fulfill({ json: state.items })
    if (path.endsWith('/inventory/locations')) return route.fulfill({ json: [{ id: 1, name: 'Main Stockroom', is_active: 1 }, { id: 2, name: 'Second Stockroom', is_active: 1 }] })
    if (path.endsWith('/inventory/master-data')) return route.fulfill({ json: { suppliers: [{ id: 17, name: 'Synthetic supplier', category: 'medical,derma', is_active: 1 }] } })
    return route.fallback()
  })
  await page.goto(`${root}/inventory`)
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Item', exact: true }).first()).toBeVisible()
  return state
}

for (const width of [1440, 390]) test(`inventory status filters compose with search, category, stock room and pagination at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await inventoryPortal(page)
  await page.getByRole('button', { name: 'Next', exact: true }).first().click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  const status = page.getByRole('combobox', { name: 'Filter by stock status' })
  await status.selectOption('low')
  await expect(page.getByText('Low medicine', { exact: true })).toBeVisible()
  await expect(page.getByText('Another low medicine', { exact: true })).toBeVisible()
  await expect(page.getByText('Empty medicine', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dermatology', exact: true }).click()
  await expect(page.getByText('Low medicine', { exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Filter by stock room' }).selectOption('1')
  await expect(page.getByText('No inventory items match your filters.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Filter by stock room' }).selectOption('All')
  await page.getByRole('group', { name: 'Filter by clinic category' }).getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: /^Out of Stock/ }).click()
  await expect(status).toHaveValue('out')
  await expect(page.getByText('Empty medicine', { exact: true })).toBeVisible()
  await expect(page.getByText('Reserved medicine', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Expiring in 30 Days/ }).click()
  await expect(status).toHaveValue('expiring')
  await expect(page.getByText('Expiring medicine', { exact: true })).toBeVisible()
  await expect(page.getByText('Depleted batch medicine', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Expiring in 30 Days/ })).toContainText('1')
  await page.getByLabel('Search inventory').fill('not present')
  await expect(page.getByText('No inventory items match your filters.')).toBeVisible()
  await page.getByLabel('Search inventory').fill('')
  await page.getByRole('button', { name: /^Tracked Items/ }).click()
  await expect(status).toHaveValue('All')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
})

for (const role of ['admin', 'superadmin', 'staff']) test(`${role} barcode edit sends metadata only and preserves stock`, async ({ page }) => {
  const state = await inventoryPortal(page, role)
  const originalStock = state.items[0].stock
  await page.getByRole('button', { name: 'Edit Item', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit Inventory Item' })
  await dialog.getByLabel('Product barcode', { exact: true }).fill('M1-00001')
  await dialog.getByRole('button', { name: 'Save Item Details', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.edits).toHaveLength(1)
  expect(state.edits[0].barcode).toBe('M1-00001')
  for (const field of ['stock', 'stock_base', 'expiration_date', 'batch_code']) expect(state.edits[0]).not.toHaveProperty(field)
  expect(state.items[0].stock).toBe(originalStock)
  if (role === 'staff') expect(state.edits[0]).not.toHaveProperty('selling_price')
  await page.reload()
  await page.getByRole('button', { name: 'Edit Item', exact: true }).first().click()
  await expect(page.getByLabel('Product barcode', { exact: true })).toHaveValue('M1-00001')
})

test('new item still sends opening quantity and expiry', async ({ page }) => {
  const state = await inventoryPortal(page)
  await page.getByRole('button', { name: 'Add Item', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Item' })
  await dialog.locator('input[maxlength="150"]').fill('New synthetic medicine')
  await dialog.locator('select').nth(1).selectOption('1')
  await dialog.locator('select').nth(2).selectOption('17')
  await dialog.locator('input[type="number"]').nth(0).fill('12')
  await dialog.locator('input[type="date"]').fill('2028-11-11')
  await dialog.locator('input[type="number"]').last().fill('650')
  await dialog.getByRole('button', { name: 'Add Medicine', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(state.creates).toHaveLength(1)
  expect(state.creates[0].stock).toBe(12)
  expect(state.creates[0].expiration_date).toBe('2028-11-11')
})

test('short product barcode decodes at its rendered size and batch code remains a text identifier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await inventoryPortal(page)
  await page.getByRole('button', { name: 'Edit Item', exact: true }).first().click()
  await page.getByLabel('Product barcode', { exact: true }).fill('M1-00001')
  const decode = async (label) => {
    const pixels = await page.getByRole('img', { name: label, exact: true }).evaluate(async svg => {
      const bounds = svg.getBoundingClientRect(), width = Math.round(bounds.width), height = Math.round(bounds.height)
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d'), image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
      await image.decode(); context.drawImage(image, 0, 0, width, height)
      const rgba = context.getImageData(0, 0, width, height).data
      return { width, height, gray: Array.from({ length: width * height }, (_, i) => rgba[i * 4]) }
    })
    const source = new RGBLuminanceSource(Uint8ClampedArray.from(pixels.gray), pixels.width, pixels.height)
    return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText()
  }
  expect(await decode('Product Barcode Preview: M1-00001')).toBe('M1-00001')
  await page.getByRole('dialog', { name: 'Edit Inventory Item' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Stock In', exact: true }).first().click()
  await expect(page.getByText('B1-001',{exact:true})).toBeVisible()
  await expect(page.getByRole('img',{name:/New Batch:/})).toHaveCount(0)
})
