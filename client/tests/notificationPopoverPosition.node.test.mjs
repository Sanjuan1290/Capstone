import assert from 'node:assert/strict'
import test from 'node:test'
import { getNotificationPopoverPosition } from '../src/components/notificationPopoverPosition.mjs'

const mobileAndDesktopWidths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]

test('notification panel stays inside every required viewport width when the bell is left of header actions', () => {
  for (const width of mobileAndDesktopWidths) {
    const position = getNotificationPopoverPosition({
      anchorRect: { left: 120, right: 160, top: 8, bottom: 48 },
      viewport: { left: 0, top: 0, width, height: 740 },
    })

    assert.ok(position.left >= 12, `${width}px: panel left edge should keep a 12px inset`)
    assert.ok(position.left + position.width <= width - 12, `${width}px: panel right edge should keep a 12px inset`)
    assert.ok(position.maxHeight <= 384, `${width}px: panel height should respect its maximum`)
  }
})

test('narrow viewport shrinks the panel and clamps a left-side bell to the screen edge', () => {
  const position = getNotificationPopoverPosition({
    anchorRect: { left: 124, right: 164, top: 8, bottom: 48 },
    viewport: { left: 0, top: 0, width: 320, height: 740 },
  })

  assert.deepEqual(position, {
    left: 12,
    top: 56,
    width: 296,
    maxHeight: 384,
    placement: 'below',
  })
})

test('patient and staff header action groups no longer push the bell panel past the phone edge', () => {
  const trailingActionsWidth = { patient: 156, doctor: 156, staff: 112, admin: 112 }

  for (const width of [320, 360, 375, 390, 414, 430]) {
    for (const [role, trailingWidth] of Object.entries(trailingActionsWidth)) {
      const anchorRect = {
        left: width - trailingWidth - 40,
        right: width - trailingWidth,
        top: 8,
        bottom: 48,
      }
      const oldLeft = anchorRect.right - Math.min(320, width * 0.92)
      const position = getNotificationPopoverPosition({
        anchorRect,
        viewport: { left: 0, top: 0, width, height: 740 },
      })

      if (width === 320) assert.ok(oldLeft < 0, `${role}: legacy right-aligned placement should reproduce the phone overflow`)
      assert.ok(position.left >= 12, `${role} at ${width}px: panel should keep a 12px left inset`)
      assert.ok(position.left + position.width <= width - 12, `${role} at ${width}px: panel should keep a 12px right inset`)
    }
  }
})

test('popover uses visible viewport offsets when a mobile keyboard or zoom shifts the visual viewport', () => {
  const position = getNotificationPopoverPosition({
    anchorRect: { left: 250, right: 290, top: 470, bottom: 510 },
    viewport: { left: 18, top: 220, width: 320, height: 300 },
  })

  assert.equal(position.left, 30)
  assert.equal(position.placement, 'above')
  assert.equal(position.top, 462)
  assert.equal(position.maxHeight, 230)
  assert.ok(position.top - position.maxHeight >= 232)
})

test('short landscape viewports place the panel above the bell when that provides more scrolling room', () => {
  const position = getNotificationPopoverPosition({
    anchorRect: { left: 620, right: 660, top: 326, bottom: 366 },
    viewport: { left: 0, top: 0, width: 667, height: 375 },
  })

  assert.equal(position.placement, 'above')
  assert.equal(position.top, 318)
  assert.equal(position.maxHeight, 306)
  assert.ok(position.top - position.maxHeight >= 12)
  assert.ok(position.left + position.width <= 655)
})

test('popover stays below the bell when the viewport has room there', () => {
  const position = getNotificationPopoverPosition({
    anchorRect: { left: 150, right: 190, top: 20, bottom: 60 },
    viewport: { left: 0, top: 0, width: 390, height: 844 },
  })

  assert.equal(position.placement, 'below')
  assert.equal(position.top, 68)
  assert.equal(position.left, 12)
  assert.equal(position.maxHeight, 384)
})

