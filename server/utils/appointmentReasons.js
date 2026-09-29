const OTHER_VISIT_REASON_LABEL = 'Other'

const isOtherVisitReason = (value) => String(value || '').trim().toLowerCase() === 'other'

const withSystemOtherVisitReason = (rows = []) => {
  const normalized = Array.isArray(rows) ? rows : []
  const withoutOther = normalized.filter((row) => !isOtherVisitReason(row?.label))
  return [
    ...withoutOther,
    {
      id: 'system-other',
      label: OTHER_VISIT_REASON_LABEL,
      clinic_type: 'all',
      is_active: 1,
      sort_order: 999999,
      is_system_fallback: true,
    },
  ]
}

module.exports = { OTHER_VISIT_REASON_LABEL, isOtherVisitReason, withSystemOtherVisitReason }
