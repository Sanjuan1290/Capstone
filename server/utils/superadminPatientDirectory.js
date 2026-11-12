'use strict'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

// Older activated accounts can still have is_walk_in=1. Credentials identify
// those as registered; guest records remain distinct from portal accounts.
const REGISTERED_PATIENT_SQL = "(COALESCE(p.is_walk_in, 0) = 0 OR TRIM(COALESCE(p.password, '')) <> '')"
const GUEST_PATIENT_SQL = `(NOT ${REGISTERED_PATIENT_SQL} AND (p.consent_method = 'guest_online' OR EXISTS (SELECT 1 FROM appointments guest_visit WHERE guest_visit.patient_id=p.id AND guest_visit.appointment_source='guest_online')))`
const DIRECTORY_PATIENT_SQL = `(${REGISTERED_PATIENT_SQL} OR ${GUEST_PATIENT_SQL})`
const PATIENT_TYPE_SQL = `CASE WHEN ${REGISTERED_PATIENT_SQL} THEN 'registered' ELSE 'guest' END`

const parseDirectoryPagination = (pageValue, pageSizeValue) => {
  const rawPage = Number(pageValue)
  const rawSize = Number(pageSizeValue)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000000) : 1
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawSize) ? rawSize : 20
  return { page, pageSize, offset: (page - 1) * pageSize }
}

const buildPatientDirectoryWhere = ({ search = '', status = 'all' } = {}) => {
  const clauses = [DIRECTORY_PATIENT_SQL]
  const params = []
  const term = String(search || '').trim().slice(0, 100)

  if (term) {
    const like = `%${term}%`
    const searchParts = [
      'LOWER(p.full_name) LIKE LOWER(?)',
      'LOWER(COALESCE(p.email, \'\')) LIKE LOWER(?)',
      'p.phone LIKE ?',
    ]
    params.push(like, like, like)

    // Only add phone matching for phone-shaped searches. Digits inside an
    // email/name must not match every unrelated patient with that phone digit.
    const digits = /^[+\d().\s-]+$/.test(term)
      ? term.replace(/\D/g, '').replace(/^0(?=[2-9]\d{7,9}$)/, '63')
      : ''
    if (digits) {
      searchParts.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?")
      params.push(`%${digits}%`)
    }
    clauses.push(`(${searchParts.join(' OR ')})`)
  }

  if (status === 'active') clauses.push(REGISTERED_PATIENT_SQL, 'COALESCE(p.is_banned, 0) = 0')
  else if (status === 'banned') clauses.push(REGISTERED_PATIENT_SQL, 'COALESCE(p.is_banned, 0) = 1')
  else if (status === 'registered') clauses.push(REGISTERED_PATIENT_SQL)
  else if (status === 'guest') clauses.push(GUEST_PATIENT_SQL)

  return { whereSql: clauses.join(' AND '), params }
}

const parseBanState = (value) => {
  if (typeof value !== 'boolean') {
    const error = new Error('The banned value must be true or false.')
    error.statusCode = 400
    error.code = 'INVALID_BAN_STATUS'
    throw error
  }
  return value
}

module.exports = {
  PAGE_SIZE_OPTIONS,
  parseDirectoryPagination,
  buildPatientDirectoryWhere,
  parseBanState,
  REGISTERED_PATIENT_SQL,
  GUEST_PATIENT_SQL,
  DIRECTORY_PATIENT_SQL,
  PATIENT_TYPE_SQL,
}
