import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { paginatePatientServices, PATIENT_SERVICES_PAGE_SIZE } from '../src/utils/patientServicePagination.mjs'
import { listServicesForCategory } from '../src/utils/patientServicePresentation.mjs'

const source = readFileSync(new URL('../src/components/services/PatientServices.jsx', import.meta.url), 'utf8')
const services = Array.from({ length: 17 }, (_, i) => ({ id: i + 1, clinic_type: i % 2 ? 'derma' : 'medical', service_name: `Service ${i + 1}` }))

test('All Services returns every active service supplied by the branch API across pages', () => {
  const filtered = listServicesForCategory(services, 'all')
  assert.equal(filtered.length, 17)
  assert.equal(PATIENT_SERVICES_PAGE_SIZE, 6)
  const pages = [1, 2, 3].map(p => paginatePatientServices(filtered, p))
  assert.deepEqual(pages.map(x => x.pageItems.length), [6, 6, 5])
  assert.deepEqual(pages.flatMap(x => x.pageItems.map(s => s.id)), services.map(s => s.id))
})
test('Pagination works for General Medicine and Dermatology filters too', () => {
  for (const category of ['medical', 'derma']) {
    const results = listServicesForCategory(services, category)
    const initial = paginatePatientServices(results, 1)
    const all = Array.from({ length: initial.pageCount }, (_, n) => paginatePatientServices(results, n + 1)).flatMap(page => page.pageItems)
    assert.deepEqual(all, results)
  }
})
test('Invalid, out-of-range, and stale pages are clamped safely', () => {
  for (const p of [0, -5, Number.NaN, undefined, 'invalid']) assert.equal(paginatePatientServices(services, p).safePage, 1)
  assert.equal(paginatePatientServices(services, 999).safePage, 3)
  assert.deepEqual(paginatePatientServices(services.slice(0, 2), 3).pageItems.map(s => s.id), [1, 2])
})
test('Empty or invalid API responses return a single empty page', () => {
  for (const value of [null, undefined, [], {}]) {
    const state = paginatePatientServices(value)
    assert.equal(state.total, 0)
    assert.equal(state.pageCount, 1)
    assert.deepEqual(state.pageItems, [])
  }
})
test('Page size is fixed by default but helper rejects invalid sizes', () => {
  assert.equal(paginatePatientServices(services, 1, 0).pageSize, 6)
  assert.equal(paginatePatientServices(services, 1, -3).pageSize, 6)
  assert.equal(paginatePatientServices(services, 1, 10).pageCount, 2)
})
test('Patient Dashboard shows pages immediately with no extra View All / Show Fewer step', () => {
  assert.match(source, /paginatePatientServices\(visible, page\)/)
  assert.match(source, /<Pagination page=\{safePage\} totalPages=\{pageCount\} total=\{visible.length\}/)
  assert.match(source, /onPageChange=\{goToPage\}/)
  assert.match(source, /scrollIntoView/ )
  assert.match(source, /aria-label="Available services pagination"/)
  assert.doesNotMatch(source, /expanded|View All Services|Show Fewer|MdExpandMore|MdExpandLess/)
})
test('Category and branch switches reset page one and preserve displayed prices and booking links', () => {
  assert.match(source, /setCategory\(id\); setPage\(1\)/)
  assert.match(source, /setServices\(\[\]\); setCategory\('all'\); setPage\(1\)/)
  assert.match(source, /getBookingServices\('',branchId\)/)
  assert.match(source, /formatPublicServicePrice\(service\)/)
  assert.match(source, /serviceBookingPath\(service,branchId\)/)
})
