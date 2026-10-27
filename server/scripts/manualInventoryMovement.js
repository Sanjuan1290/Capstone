// Compatibility wrapper.
// The real implementation lives in server/utils/manualInventoryMovement.js.
// Keep a single source of truth so source-graph verification and runtime imports stay aligned.
module.exports = require('../utils/manualInventoryMovement')

