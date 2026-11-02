// The patient dashboard never truncates the available service catalog.
// Every branch/category result remains reachable through the pagination bar.
export const PATIENT_SERVICES_PAGE_SIZE = 6

export function paginatePatientServices(services, requestedPage = 1, pageSize = PATIENT_SERVICES_PAGE_SIZE) {
  const rows = Array.isArray(services) ? services : []
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : PATIENT_SERVICES_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const desired = Number(requestedPage)
  const safePage = Number.isSafeInteger(desired) ? Math.min(pageCount, Math.max(1, desired)) : 1
  const offset = (safePage - 1) * size
  return {
    pageItems: rows.slice(offset, offset + size),
    pageCount,
    safePage,
    pageSize: size,
    total: rows.length,
  }
}
