/** Pure presentation helpers; these do not alter the backend's financial calculations. */
export const isValidReportPeriod=(from,to)=>/^\d{4}-\d{2}-\d{2}$/.test(from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(to||'')&&from<=to
export const sumBranchMetric=(rows=[],key)=>rows.reduce((total,row)=>total+Number(row?.[key]||0),0)
export const escapeCsvCell=(value)=>{
 const raw=String(value??'')
 // Spreadsheet tools may interpret these leading characters as formulas.
 const safe=/^[\s\r\n]*[=+@\-]/.test(raw)?`'${raw}`:raw
 return `"${safe.replaceAll('"','""')}"`
}
export const BRANCH_CSV_COLUMNS=['name','appointments','pending','completed','no_shows','doctors','billed','collected']
export const buildBranchReportCsv=(rows=[])=>[
 BRANCH_CSV_COLUMNS.join(','),
 ...rows.map(row=>BRANCH_CSV_COLUMNS.map(key=>escapeCsvCell(row[key])).join(',')),
].join('\r\n')
