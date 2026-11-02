import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(resolve(root, 'src/pages/shared/Inventory.jsx'), 'utf8')
const tools = readFileSync(resolve(root, 'src/components/system/InventoryExcelTools.jsx'), 'utf8')

test('inventory page stays mounted across background data refreshes', () => {
  assert.match(page, /\[initialLoadComplete,\s*setInitialLoadComplete\]\s*=\s*useState\(false\)/)
  assert.match(page, /setInitialLoadComplete\(true\)/)
  assert.match(page, /if\s*\(!initialLoadComplete\)\s*\{/)
  assert.doesNotMatch(page, /if\s*\(loading\)\s*\{\s*return\s*<div[^>]*>Loading inventory/)
})

test('Excel modal activity pauses event and focus refresh', () => {
  assert.match(page, /\[excelWorkflowActive,\s*setExcelWorkflowActive\]/)
  assert.match(page, /skip:\s*\(\)\s*=>\s*excelWorkflowActive\s*\|\|/)
  assert.match(page, /onWorkflowChange=\{setExcelWorkflowActive\}/)
})

test('opening OS file picker sets activity before opening the picker', () => {
  assert.match(tools, /const chooseUpload\s*=\s*\(\)\s*=>\s*\{[\s\S]*?onWorkflowChange\?\.\(true\)[\s\S]*?fileRef\.current\?\.click\(\)/)
  assert.match(tools, /onClick=\{chooseUpload\}/)
})

test('preview closes only with explicit cancel or successful save', () => {
  assert.match(tools, /const closePreview\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(busy\)\s*return[\s\S]*?setPreview\(null\)/)
  assert.match(tools, /onClick=\{closePreview\}[^>]*aria-label="Close Excel review"/)
  assert.match(tools, /onClick=\{closePreview\}>Cancel/)
  assert.match(tools, /setResults\(\{ type: preview\.mode/)
})

test('file cancel, parse errors, and completed imports release refresh pause', () => {
  assert.match(tools, /onCancel=\{\(\)=>onWorkflowChange\?\.\(false\)\}/)
  assert.match(tools, /Could not read the Excel file[\s\S]*?onWorkflowChange\?\.\(false\)/)
  assert.match(tools, /setPreview\(null\); setConfirmed\(false\)\s*onWorkflowChange\?\.\(false\)\s*try\s*\{\s*await onUpdated/)
})

test('bulk Excel updates still cannot mutate stock or batches', () => {
  assert.match(tools, /Only New Selling Price and New Low Stock Alert can change/)
  assert.match(tools, /services\.bulkUpdateInventoryItems\(payload\)/)
  assert.doesNotMatch(tools, /services\.updateStock\(/)
})

