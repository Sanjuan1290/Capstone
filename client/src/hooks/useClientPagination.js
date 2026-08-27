import { useEffect, useMemo, useState } from 'react'

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const useClientPagination = (items = [], options = {}) => {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(Number(options.initialPageSize) || 10)
  const total = Array.isArray(items) ? items.length : 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = clamp(page, 1, totalPages)

  useEffect(() => {
    setPage(1)
  }, options.resetDeps || []) // Reset whenever search/filter inputs change.

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (Array.isArray(items) ? items : []).slice(start, start + pageSize)
  }, [currentPage, items, pageSize])

  return {
    page: currentPage,
    pageSize,
    total,
    totalPages,
    pageItems,
    setPage,
    setPageSize: (nextSize) => {
      setPage(1)
      setPageSize(Math.max(1, Number(nextSize) || 10))
    },
  }
}

export default useClientPagination

