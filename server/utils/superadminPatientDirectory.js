'use strict'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

const parseDirectoryPagination = (pageValue, pageSizeValue) => {
  const rawPage = Number(pageValue)
  const rawSize = Number(pageSizeValue)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000000) : 1
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawSize) ? rawSize : 20
  return { page, pageSize, offset: (page - 1) * pageSize }
}

const buildPatientDirectoryWhere = ({ search = '', status = 'all' } = {}) => {
  const clauses = ['COALESCE(p.is_walk_in, 0) = 0']
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

    const digits = term.replace(/\D/g, '')
    if (digits) {
      searchParts.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?")
      params.push(`%${digits}%`)
    }
    clauses.push(`(${searchParts.join(' OR ')})`)
  }

  if (status === 'active') clauses.push('COALESCE(p.is_banned, 0) = 0')
  else if (status === 'banned') clauses.push('COALESCE(p.is_banned, 0) = 1')

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
}
