const QUEUE_STATUSES = new Set(['waiting', 'in-progress', 'done', 'removed'])
const SUPPLY_REQUEST_RESOLUTIONS = new Set(['approved', 'rejected'])

const isValidQueueStatus = (value) => QUEUE_STATUSES.has(String(value || '').trim())
const isValidSupplyRequestResolution = (value) => SUPPLY_REQUEST_RESOLUTIONS.has(String(value || '').trim())

module.exports = {
  QUEUE_STATUSES,
  SUPPLY_REQUEST_RESOLUTIONS,
  isValidQueueStatus,
  isValidSupplyRequestResolution,
}
