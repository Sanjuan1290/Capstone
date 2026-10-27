const hasNumberFields = (value, fields) => fields.every(key =>
  value[key] !== null && value[key] !== undefined && value[key] !== '' && Number.isFinite(Number(value[key]))
)

const isBranchMetrics = value => Array.isArray(value) && value.every(row =>
  row && typeof row === 'object' && !Array.isArray(row) && row.id != null && typeof row.name === 'string' &&
  hasNumberFields(row, ['is_active', 'appointments', 'pending', 'completed', 'no_shows', 'doctors', 'billed', 'collected'])
)

const isTrendRows = value => Array.isArray(value) && value.every(row =>
  row && typeof row === 'object' && !Array.isArray(row) && typeof row.date === 'string' &&
  hasNumberFields(row, ['appointments', 'completed'])
)

const isReadinessRows = value => Array.isArray(value) && value.every(row =>
  row && typeof row === 'object' && !Array.isArray(row) && row.id != null && typeof row.name === 'string' &&
  (typeof row.is_active === 'boolean' || row.is_active === 0 || row.is_active === 1) &&
  typeof row.ready === 'boolean' && Array.isArray(row.missing)
)

const validators = [isBranchMetrics, isTrendRows, isReadinessRows]

export async function loadOverviewSections({ from, to, branch = 'all', fetchJson, isValidReportPeriod }) {
  if (!isValidReportPeriod(from, to)) {
    return {
      rows: null,
      trends: null,
      readiness: null,
      errors: { period: 'Choose a valid reporting period. The start date must be on or before the end date.' },
    }
  }

  const paths = [
    `/analytics/all?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    `/analytics/trends?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branch !== 'all' ? `&branch_id=${encodeURIComponent(branch)}` : ''}`,
    '/analytics/readiness',
  ]
  const labels = ['Branch metrics', 'Appointment trends', 'Branch readiness']
  const results = await Promise.allSettled(paths.map(path => Promise.resolve().then(() => fetchJson(path))))
  const values = [null, null, null]
  const errors = {}

  results.forEach((result, index) => {
    const key = ['rows', 'trends', 'readiness'][index]
    if (result.status === 'rejected') {
      errors[key] = `${labels[index]} could not load: ${result.reason?.message || 'Please retry.'}`
      return
    }

    const value = result.value
    const normalized = index === 1 ? value?.appointments : value
    if (!validators[index](normalized)) {
      errors[key] = `${labels[index]} returned an unexpected response format.`
      return
    }
    values[index] = normalized
  })

  return { rows: values[0], trends: values[1], readiness: values[2], errors }
}


