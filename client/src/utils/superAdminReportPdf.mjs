import { REPORT_SECTIONS, reportTables } from '../pages/superAdminPage/redesign/reportPresentation.mjs'

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const number = value => Number(value || 0)
const moneyMetrics = new Set(['Gross Billed', 'Net Billed', 'Discounts', 'Promotion Discounts', 'Gross Received', 'Voided', 'Refunded', 'Net Collected', 'Outstanding', 'Outstanding Balance', 'Estimated Selling Value'])
const formatCell = (value, table, row, index) => {
  if (typeof value !== 'number') return escapeHtml(value)
  const currency = (table.name === 'Payment Methods' && index >= 2)
    || (table.name === 'Branch Comparison' && index >= 3)
    || (table.name === 'Inventory by Category' && index === 2)
    || (table.name === 'Services' && index === 4)
    || (table.name === 'Promotions' && index === 3)
    || (index === 2 && (row[0] === 'Revenue Trend' || moneyMetrics.has(row[1])))
  const percent = index === 2 && String(row[1]).endsWith('Rate')
  return escapeHtml(currency ? money(value) : percent ? `${value.toFixed(1)}%` : value.toLocaleString('en-PH', { maximumFractionDigits: 2 }))
}

export function buildSuperAdminReportHtml(reports, { branchName = 'All Branches', from, to, branches = [], generatedAt = new Date() } = {}) {
  const tables = reportTables(reports, { branchName, from, to, branches })
  tables.splice(2, 0, { name: 'Branch Comparison', headers: ['Branch', 'Appointments', 'Completed', 'Net Billed', 'Net Collected'], rows: branches.map(branch => [branch.name, number(branch.appointments), number(branch.completed), number(branch.billed), number(branch.collected)]) })
  tables.splice(tables.findIndex(table => table.name === 'Inventory') + 1, 0, { name: 'Inventory by Category', headers: ['Category', 'Products', 'Selling-value Estimate'], rows: (reports.inventory.categories || []).map(category => [category.name, number(category.products), number(category.estimated_selling_value)]) })
  const generated = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt)
  const content = tables.slice(1).map(table => `<section><h2>${escapeHtml(table.name)}</h2><table><thead><tr>${table.headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${table.rows.length ? table.rows.map(row => `<tr>${table.headers.map((_, index) => `<td${typeof row[index] === 'number' ? ' class="number"' : ''}>${formatCell(row[index], table, row, index)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${table.headers.length}">No records for the selected filters.</td></tr>`}</tbody></table></section>`).join('')
  const notes = REPORT_SECTIONS.filter(section => reports[section.value]?.note).map(section => `<p><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(reports[section.value].note)}</p>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Carait Clinic Reports - ${escapeHtml(branchName)} - ${escapeHtml(from)} to ${escapeHtml(to)}</title><style>
    @page { size: A4; margin: 13mm 12mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding-bottom: 10mm; color: #0f172a; font: 10px Arial, sans-serif; }
    header { border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 10px; font-weight: bold; letter-spacing: 1px; color: #0f766e; }
    h1 { margin: 6px 0; font-size: 21px; }
    h2 { margin: 16px 0 7px; font-size: 13px; break-after: avoid; }
    p { margin: 4px 0; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { padding: 6px; border: 1px solid #cbd5e1; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #e6f5f2; text-align: left; font-size: 9px; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .notes { margin-top: 16px; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; }
    footer { position: fixed; bottom: -12mm; left: 0; right: 0; text-align: center; color: #64748b; font-size: 8px; }
  </style></head><body><header><p class="brand">CARAIT MEDICAL AND DERMATOLOGY CLINIC</p><h1>Reports &amp; Analytics</h1><p><strong>Branch scope:</strong> ${escapeHtml(branchName)}</p><p><strong>Reporting period:</strong> ${escapeHtml(from)} to ${escapeHtml(to)}</p><p><strong>Generated:</strong> ${escapeHtml(generated)} (Philippine time)</p></header>
  <p>Aggregate clinic information only. Bills use finalization dates; payments, voids and refunds use their event dates. Current balances and inventory snapshots are separate from activity within the reporting period.</p>
  ${content}<aside class="notes"><h2>Report Notes</h2>${notes || '<p>No additional notes.</p>'}${reports.inventory?.as_of ? `<p><strong>Inventory snapshot:</strong> ${escapeHtml(reports.inventory.as_of)}</p>` : ''}</aside>
  <footer>Carait Clinic · ${escapeHtml(branchName)} · ${escapeHtml(from)} to ${escapeHtml(to)}</footer></body></html>`
}

export function printSuperAdminReport(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.title = 'Printable Carait Clinic reports'
    frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;'
    const cleanup = () => frame.remove()
    frame.onload = () => {
      try {
        const win = frame.contentWindow
        if (!win) throw new Error('Unable to open the printable report. Please retry.')
        win.addEventListener('afterprint', cleanup, { once: true })
        win.focus()
        win.print()
        window.setTimeout(cleanup, 10000)
        resolve()
      } catch (error) { cleanup(); reject(error) }
    }
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}
