const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

export const getNotificationPopoverPosition = ({
  anchorRect,
  viewport,
  preferredWidth = 320,
  preferredHeight = 384,
  edge = 12,
  gap = 8,
}) => {
  const viewportLeft = Number(viewport.left) || 0
  const viewportTop = Number(viewport.top) || 0
  const viewportWidth = Math.max(0, Number(viewport.width) || 0)
  const viewportHeight = Math.max(0, Number(viewport.height) || 0)
  const usableWidth = Math.max(0, viewportWidth - (edge * 2))
  const width = Math.min(preferredWidth, usableWidth)
  const minimumLeft = viewportLeft + Math.min(edge, viewportWidth / 2)
  const maximumLeft = Math.max(minimumLeft, viewportLeft + viewportWidth - edge - width)
  const left = clamp(anchorRect.right - width, minimumLeft, maximumLeft)

  const viewportBottom = viewportTop + viewportHeight - edge
  const spaceBelow = Math.max(0, viewportBottom - anchorRect.bottom - gap)
  const spaceAbove = Math.max(0, anchorRect.top - gap - viewportTop - edge)
  const shouldPlaceAbove = spaceBelow < Math.min(preferredHeight, 240) && spaceAbove > spaceBelow
  const availableHeight = shouldPlaceAbove ? spaceAbove : spaceBelow

  return {
    left,
    top: shouldPlaceAbove ? anchorRect.top - gap : anchorRect.bottom + gap,
    width,
    maxHeight: Math.min(preferredHeight, availableHeight),
    placement: shouldPlaceAbove ? 'above' : 'below',
  }
}

