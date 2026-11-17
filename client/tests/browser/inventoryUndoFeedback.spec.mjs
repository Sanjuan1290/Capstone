import { test, expect } from '@playwright/test'
import { mockClinic } from './helpers/clinic20261111.mjs'

async function inventory(page, { role = 'superadmin', uploadType = 'new_items', blocked = false, alreadyUndone = false, staleHistory = false, refreshFailure = false, hold = false } = {}) {
  await mockClinic(page, role)
  const branchId = role === 'superadmin' ? 30002 : 1
  const state = {
    undone: false, undoRequests: [], inventoryReads: 0,
    items: [{ id: 22, branch_id: branchId, name: 'Imported Medicine', barcode: 'M-00022', category: 'medical', item_type: 'medicine', unit: 'unit', uom: 'unit', base_unit: 'unit', unit_size: 1, stock: 0, available_stock: 0, selling_price: 50, price: 50, threshold: 5, default_location_id: 42, batches: [] }],
  }
  let release
  const waiting = hold ? new Promise(resolve => { release = resolve }) : Promise.resolve()
  state.release = () => release?.()
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const send = (json, status = 200) => route.fulfill({ status, json })
    if (path === '/api/branches' || path === '/api/branches/') return send([{ id: branchId, name: 'Test Branch', is_active: 1 }])
    if (path.endsWith('/inventory/master-data')) return send({ suppliers: [], location_types: [], movement_reasons: [] })
    if (path.endsWith('/inventory/locations')) return send([{ id: 42, name: 'Main Stock Room', location_type: 'stockroom', is_main_stockroom: 1, is_active: 1 }])
    if (path.endsWith('/inventory/archived')) return send([])
    if (path.endsWith('/inventory/logs')) return send({ items: [], pagination: { page: 1, total: 0, totalPages: 1, limit: 10 } })
    if (path.endsWith('/inventory/excel-imports/2/undo')) {
      const body = route.request().postDataJSON()
      state.undoRequests.push({ path, body })
      await waiting
      if (blocked) return send({ code: 'ITEM_REFERENCED', message: 'Imported Medicine is linked to a service or visit. Undo was stopped; no changes were made.' }, 409)
      state.undone = true
      if (alreadyUndone) return send({ code: 'ALREADY_UNDONE', message: 'This Excel upload was already undone.' }, 409)
      state.items = uploadType === 'new_items' ? [] : state.items.map(item => ({ ...item, selling_price: 30, price: 30, threshold: 2 }))
      return send({ undone: true, upload_id: 2, removed_items: uploadType === 'new_items' ? 1 : 0, restored_items: uploadType === 'item_edits' ? 1 : 0, message: uploadType === 'new_items' ? 'Excel upload #2 was undone. 1 imported item(s) removed from inventory.' : 'Excel upload #2 was undone. 1 item(s) restored to their values before this upload.' })
    }
    if (path.endsWith('/inventory/excel-imports')) {
      if (state.undone && refreshFailure) return send({ message: 'History refresh unavailable.' }, 503)
      return send({ items: [{ id: 2, upload_type: uploadType, created_at: '2026-11-17T10:00:00+08:00', undone_at: state.undone && !staleHistory ? '2026-11-17T11:00:00+08:00' : null, undo_reason: state.undone && !staleHistory ? alreadyUndone ? 'Earlier correction' : state.undoRequests[0].body.reason : null }], pagination: { page: 1, total: 1, totalPages: 1 } })
    }
    if (path.endsWith('/inventory')) {
      state.inventoryReads++
      if (state.undone && refreshFailure) return send({ message: 'Inventory refresh unavailable.' }, 503)
      return send(state.items)
    }
    return route.fallback()
  })
  await page.goto(role === 'superadmin' ? `/superadmin/branches/${branchId}/inventory` : '/admin/inventory')
  const tools = page.getByRole('region', { name: 'Inventory Excel tools', exact: true })
  await tools.getByRole('button', { name: 'Show Excel Tools', exact: true }).click()
  await tools.getByRole('button', { name: 'Show History', exact: true }).click()
  const row = tools.getByRole('article', { name: 'Excel upload #2', exact: true })
  await expect(row).toContainText('Saved')
  await expect(page.getByText('Imported Medicine', { exact: true }).first()).toBeVisible()
  return { state, tools, row }
}

async function openUndo(row, page) {
  await row.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  return page.getByRole('dialog', { name: 'Undo Excel Upload #2', exact: true })
}

test.beforeEach(async ({ page }) => {
  page.errors = []
  page.nativeDialogs = []
  page.on('pageerror', error => page.errors.push(error.message))
  page.on('dialog', async dialog => { page.nativeDialogs.push(dialog.type()); await dialog.dismiss() })
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
})
test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([])
  expect(page.nativeDialogs).toEqual([])
})

test('undo uses a reason modal, validates/cancels safely, and updates inventory and status once', async ({ page }) => {
  const { state, tools, row } = await inventory(page, { hold: true, staleHistory: true })
  let modal = await openUndo(row, page)
  await modal.getByLabel('Reason for undo', { exact: true }).fill('tiny')
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  await expect(modal.getByRole('alert')).toHaveText('Enter a reason between 5 and 255 characters.')
  expect(state.undoRequests).toHaveLength(0)
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect(state.undoRequests).toHaveLength(0)
  modal = await openUndo(row, page)
  await modal.getByLabel('Reason for undo', { exact: true }).fill('  Imported the wrong file  ')
  await modal.screenshot({ path: '../QA_REPORT/inventory-undo-2026-11-17/reason-modal.png' })
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).dblclick()
  await expect(modal.getByRole('status')).toContainText('Checking affected items')
  await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  expect(state.undoRequests).toHaveLength(1)
  expect(state.undoRequests[0]).toEqual({ path: '/api/branches/workspace/30002/legacy/inventory/excel-imports/2/undo', body: { confirmation: 'UNDO', reason: 'Imported the wrong file' } })
  state.release()
  await expect(modal).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Already Undone', exact: true })).toBeDisabled()
  await expect(row).toContainText('Imported items were removed from inventory.')
  await expect(row).toContainText('Undo reason: Imported the wrong file')
  await expect(tools.getByRole('status')).toContainText('1 imported item(s) removed')
  await expect(page.getByText('Imported Medicine', { exact: true })).toHaveCount(0)
  expect(state.inventoryReads).toBeGreaterThan(1)
  await tools.screenshot({ path: '../QA_REPORT/inventory-undo-2026-11-17/undo-success.png' })
})

test('item-edit undo reports restored values while retaining the inventory item', async ({ page }) => {
  const { state, tools, row } = await inventory(page, { role: 'admin', uploadType: 'item_edits' })
  const modal = await openUndo(row, page)
  await expect(modal).toContainText('Restore item values from before this upload')
  await modal.getByLabel('Reason for undo', { exact: true }).fill('Restore the earlier price')
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Already Undone', exact: true })).toBeDisabled()
  await expect(tools.getByRole('status')).toContainText('1 item(s) restored')
  await expect(row).toContainText('Item values were restored to before this upload.')
  await expect(page.getByText('Imported Medicine', { exact: true }).first()).toBeVisible()
  expect(state.inventoryReads).toBeGreaterThan(1)
  expect(state.undoRequests[0].path).toBe('/api/branches/my/legacy/inventory/excel-imports/2/undo')
})

test('blocked undo keeps the reason and shows the server explanation without changing inventory', async ({ page }) => {
  const { state, tools, row } = await inventory(page, { blocked: true })
  const modal = await openUndo(row, page)
  await modal.getByLabel('Reason for undo', { exact: true }).fill('Uploaded the wrong inventory')
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText('linked to a service or visit')
  await expect(modal.getByLabel('Reason for undo', { exact: true })).toHaveValue('Uploaded the wrong inventory')
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(tools.getByRole('alert')).toContainText('Undo was stopped; no changes were made.')
  await expect(row.getByRole('button', { name: 'Undo Upload', exact: true })).toBeEnabled()
  await expect(page.getByText('Imported Medicine', { exact: true }).first()).toBeVisible()
  expect(state.undone).toBe(false)
})

test('successful undo remains marked Undone and warns clearly when refresh fails', async ({ page }) => {
  const { state, tools, row } = await inventory(page, { refreshFailure: true })
  const modal = await openUndo(row, page)
  await modal.getByLabel('Reason for undo', { exact: true }).fill('Wrong import file selected')
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Already Undone', exact: true })).toBeDisabled()
  await expect(tools.getByRole('status')).toContainText('Undo completed, but inventory and history could not refresh.')
  expect(state.undoRequests).toHaveLength(1)
})

test('an upload already undone elsewhere updates its row without claiming another undo', async ({ page }) => {
  const { state, tools, row } = await inventory(page, { alreadyUndone: true })
  const modal = await openUndo(row, page)
  await modal.getByLabel('Reason for undo', { exact: true }).fill('Trying an earlier import again')
  await modal.getByRole('button', { name: 'Undo Upload', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(tools.getByRole('status')).toContainText('already undone. No additional changes were made.')
  await expect(row.getByRole('button', { name: 'Already Undone', exact: true })).toBeDisabled()
  await expect(row).toContainText('Undo reason: Earlier correction')
  expect(state.undoRequests).toHaveLength(1)
})
