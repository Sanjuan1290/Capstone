/**
 * Public doctor-calendar labels. A closed time is not necessarily reserved by
 * another patient: elapsed times, closures and missing state are unavailable.
 * Only an explicit booking state may be called "Booked".
 */
export const slotDisplayState = (slot = {}) => {
  if (slot?.state === 'booked') return 'booked'
  if (slot?.state === 'past' || slot?.state === 'unavailable') return 'unavailable'
  if (slot?.state === 'available') return slot.available === false ? 'unavailable' : 'available'
  return slot?.available === true ? 'available' : 'unavailable'
}

export const slotDisplayLabel = (slot) => ({
  available: 'Available',
  booked: 'Booked',
  unavailable: 'Unavailable',
})[slotDisplayState(slot)]

export const dayAvailabilityCounts = (slots = []) => {
  const counts = { available: 0, booked: 0, unavailable: 0 }
  for (const slot of Array.isArray(slots) ? slots : []) counts[slotDisplayState(slot)] += 1
  return counts
}
