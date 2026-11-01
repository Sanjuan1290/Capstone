import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/adminPage/Admin_Announcements.jsx', import.meta.url), 'utf8')
const preview = source.split('const AnnouncementPreview =')[1]?.split('const Admin_Announcements =')[0] || ''

test('post preview displays a saved or unsaved cover image', () => {
  assert.match(preview, /coverUrl\s*=\s*String\(post\.cover_image_url\s*\|\|\s*''\)\.trim\(\)/)
  assert.match(preview, /src=\{coverUrl\}/)
  assert.match(preview, /alt=\{`Cover photo for/)
  assert.match(source, /post=\{previewPost\}/)
})

test('post preview handles missing and broken images', () => {
  assert.match(preview, /\{coverUrl\s*&&\s*\(imageFailed/)
  assert.match(preview, /onError=\{\(\)\s*=>\s*setImageFailed\(true\)\}/)
  assert.match(preview, /The cover photo could not be displayed/)
})

test('post preview keeps scan-pending warning distinct from saved posts', () => {
  assert.match(preview, /awaitingImageApproval\s*&&\s*coverUrl/)
  assert.match(source, /previewPost\.id\s*===\s*'draft'/)
})

test('both Preview buttons reuse the image-aware modal', () => {
  assert.match(source, /setPreviewPost\(\{\.\.\.form,id:'draft'\}\)/)
  assert.match(source, /setPreviewPost\(post\)/)
  assert.match(source, /<AnnouncementPreview/)
})
