const db = require('../db/connect')

// Legacy display names. They are used only as a fallback for databases that have not
// run the 2026-10-04 schema update yet. Runtime code resolves locations by role:
//   * the Main Stockroom is the active location flagged is_main_stockroom = 1
//   * a clinic's treatment room is the active room whose clinic_type matches
// so renaming a location in System Setup no longer breaks deductions or silently
// creates a duplicate empty location.
const LEGACY_MAIN_STOCKROOM_NAME = 'Main Stockroom'
const LEGACY_CLINIC_ROOM_NAMES = {
  derma: 'Dermatology Room',
  medical: 'General Medicine Room',
}

const CLINIC_TYPES = new Set(['medical', 'derma'])

const normalizeClinicType = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return CLINIC_TYPES.has(normalized) ? normalized : null
}

const isMissingColumn = (error) => error && (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054)

const resolveMainStockroom = async (executor = db, { createIfMissing = false } = {}) => {
  let row = null
  try {
    ;[[row]] = await executor.query(
      `SELECT id, name, location_type FROM inventory_locations
       WHERE COALESCE(is_active,1)=1 AND is_main_stockroom=1
       ORDER BY id ASC LIMIT 1`
    )
  } catch (error) {
    if (!isMissingColumn(error)) throw error
  }
  if (!row) {
    ;[[row]] = await executor.query(
      `SELECT id, name, location_type FROM inventory_locations
       WHERE COALESCE(is_active,1)=1 AND (name = ? OR location_type = 'stockroom')
       ORDER BY (name = ?) DESC, id ASC LIMIT 1`,
      [LEGACY_MAIN_STOCKROOM_NAME, LEGACY_MAIN_STOCKROOM_NAME]
    )
  }
  if (!row && createIfMissing) {
    // Bootstrap only (empty database). Normal operation never creates locations implicitly.
    await executor.query(
      `INSERT INTO inventory_locations (name, location_type, is_active)
       VALUES (?, 'stockroom', 1)
       ON DUPLICATE KEY UPDATE is_active = is_active`,
      [LEGACY_MAIN_STOCKROOM_NAME]
    )
    ;[[row]] = await executor.query('SELECT id, name, location_type FROM inventory_locations WHERE name = ? LIMIT 1', [LEGACY_MAIN_STOCKROOM_NAME])
    if (row) {
      await executor.query('UPDATE inventory_locations SET is_main_stockroom = 1 WHERE id = ?', [row.id]).catch((error) => {
        if (!isMissingColumn(error)) throw error
      })
    }
  }
  return row || null
}

const resolveClinicTreatmentRoom = async (clinicType, executor = db) => {
  const type = normalizeClinicType(clinicType) || 'medical'
  let row = null
  try {
    ;[[row]] = await executor.query(
      `SELECT id, name, location_type FROM inventory_locations
       WHERE COALESCE(is_active,1)=1 AND clinic_type = ? AND COALESCE(is_main_stockroom,0)=0
       ORDER BY (location_type = 'room') DESC, id ASC LIMIT 1`,
      [type]
    )
  } catch (error) {
    if (!isMissingColumn(error)) throw error
  }
  if (!row) {
    ;[[row]] = await executor.query(
      'SELECT id, name, location_type FROM inventory_locations WHERE COALESCE(is_active,1)=1 AND name = ? LIMIT 1',
      [LEGACY_CLINIC_ROOM_NAMES[type]]
    )
  }
  return row || null
}

const resolveLocationIdByName = async (name, executor = db) => {
  const locationName = String(name || '').trim()
  if (!locationName) return null
  const [[row]] = await executor.query(
    'SELECT id FROM inventory_locations WHERE name = ? AND COALESCE(is_active,1)=1 LIMIT 1',
    [locationName]
  )
  return row?.id || null
}

module.exports = {
  LEGACY_MAIN_STOCKROOM_NAME,
  LEGACY_CLINIC_ROOM_NAMES,
  normalizeClinicType,
  resolveMainStockroom,
  resolveClinicTreatmentRoom,
  resolveLocationIdByName,
}
