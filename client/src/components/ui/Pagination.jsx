import { MdChevronLeft, MdChevronRight, MdFirstPage, MdLastPage } from 'react-icons/md'

const Pagination = ({
  page = 1,
  totalPages = 1,
  total = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  disabled = false,
}) => {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1)
  const safePage = Math.min(safeTotalPages, Math.max(1, Number(page) || 1))
  const start = total > 0 ? ((safePage - 1) * pageSize) + 1 : 0
  const end = Math.min(total, safePage * pageSize)

  const goTo = (nextPage) => {
    if (disabled) return
    onPageChange?.(Math.min(safeTotalPages, Math.max(1, nextPage)))
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
        <span>{total > 0 ? `Showing ${start}-${end} of ${total}` : 'No records'}</span>
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span>Rows</span>
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="form-control h-9 min-w-20 px-2 py-1 text-xs"
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="mr-1 text-xs font-semibold text-slate-500">Page {safePage} of {safeTotalPages}</span>
        <button type="button" className="pagination-button" onClick={() => goTo(1)} disabled={disabled || safePage === 1} aria-label="First page"><MdFirstPage /></button>
        <button type="button" className="pagination-button" onClick={() => goTo(safePage - 1)} disabled={disabled || safePage === 1} aria-label="Previous page"><MdChevronLeft /></button>
        <button type="button" className="pagination-button" onClick={() => goTo(safePage + 1)} disabled={disabled || safePage === safeTotalPages} aria-label="Next page"><MdChevronRight /></button>
        <button type="button" className="pagination-button" onClick={() => goTo(safeTotalPages)} disabled={disabled || safePage === safeTotalPages} aria-label="Last page"><MdLastPage /></button>
      </div>
    </div>
  )
}

export default Pagination

