import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const source = await fs.readFile(new URL('../src/components/NotificationBell.jsx', import.meta.url), 'utf8')

test('notification popover escapes layout clipping and stays above portal navigation layers', () => {
  assert.match(source, /createPortal\([\s\S]*?document\.body/)
  assert.match(source, /z-\[70\]/)
  assert.match(source, /getNotificationPopoverPosition\(/)
})

test('notification popover repositions on viewport, orientation, keyboard, and scroll changes', () => {
  assert.match(source, /window\.addEventListener\('resize', schedulePositionUpdate\)/)
  assert.match(source, /window\.addEventListener\('scroll', schedulePositionUpdate, true\)/)
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize', schedulePositionUpdate\)/)
  assert.match(source, /window\.visualViewport\?\.addEventListener\('scroll', schedulePositionUpdate\)/)
})

test('notification popover exposes its state and supports outside-click and Escape dismissal', () => {
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /aria-controls=\{panelId\}/)
  assert.match(source, /document\.addEventListener\('pointerdown', closeOnOutsidePointer, true\)/)
  assert.match(source, /event\.key !== 'Escape'/)
  assert.match(source, /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/)
})

test('notification content wraps long strings and keeps the notification list scrollable', () => {
  assert.match(source, /overflowWrap: 'anywhere'/)
  assert.match(source, /min-h-0 flex-1 overflow-y-auto overscroll-contain/)
})
