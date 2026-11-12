import {escapeCsvCell} from './reportFormat.js'
export const REPORT_SECTIONS = [
  {value:'overview',label:'Overview'},
  {value:'appointments',label:'Appointments & Patients'},
  {value:'financial',label:'Financial'},
  {value:'services',label:'Doctors & Services'},
  {value:'inventory',label:'Inventory'},
]
const number = value => Number(value || 0)
const rowsFor = (entries) => Object.entries(entries || {}).map(([name,value]) => [name,typeof value === 'number'?value:String(value??'')])
const groupRows = (group,rows,fields) => (rows || []).map(row => [group,...fields.map(field=>row?.[field]??'')])
const displayName = key => String(key).replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
const nameValueRows = (group, data, fields=['name','count']) => groupRows(group,data,fields).map(([g,...rest])=>[g,displayName(rest[0]),rest[1]])
const context = (branchName,from,to) => [
 ['Branch scope',branchName],['From',from],['To',to],
 ['Data handling','Aggregate reporting only; no patient-identifying fields'],
 ['Financial date basis','Bills use finalization date; payments/voids/refunds use event dates'],
]
export function sectionRows(section, data, branches=[]) {
 if (!data) return []
 switch(section){
  case 'overview': return [
   ...rowsFor(data.totals).map(([key,value])=>['Summary',displayName(key),value]),
   ...branches.map(b=>['Branch',b.name,`Bookings: ${number(b.appointments)}; Net collections: ${number(b.collected)}`]),
   ...(data.revenue_trend||[]).map(r=>['Revenue Trend',r.ym,r.revenue]),
  ]
  case 'appointments': return [
   ...rowsFor(data.summary).map(([key,value])=>['Summary',displayName(key),value]),
   ...nameValueRows('Status',data.statuses),
   ...nameValueRows('Source',data.sources),
   ...nameValueRows('Department',data.departments),
  ]
  case 'financial': return [
   ...rowsFor(data.billing).map(([key,value])=>['Billing',displayName(key),value]),
   ...rowsFor(data.collections).map(([key,value])=>['Collections',displayName(key),value]),
   ['Current Snapshot','Outstanding Balance',number(data.outstanding)],
   ...nameValueRows('Promotions',[{name:'Discounts',count:data.promotions?.promotion_savings},{name:'Promotional Bills',count:data.promotions?.promotional_bills}]),
   ...(data.payments_by_method||[]).map(r=>['Payment Method',r.payment_method,r.net]),
   ...(data.revenue_trend||[]).map(r=>['Revenue Trend',r.ym,r.revenue]),
  ]
  case 'services': return [
   ...(data.doctors||[]).map(r=>['Doctor',`${r.name} (${r.branch_name})`,r.completed]),
   ...(data.services||[]).map(r=>['Service',`${r.name} (${r.branch_name})`,r.gross_billed]),
   ...(data.promotions||[]).map(r=>['Promotion',`${r.name||'Untitled'} (${r.branch_name})`,r.discounts]),
  ]
  case 'inventory': return [
   ...rowsFor(data.summary).map(([key,value])=>['Current Inventory',displayName(key),value]),
   ...(data.categories||[]).map(r=>['Category',r.name,r.products]),
   ...(data.most_used||[]).map(r=>['Most Used',r.name,r.quantity]),
   ...(data.movements||[]).map(r=>['Movement',r.name,r.quantity]),
  ]
  default: return []
 }
}
export function sectionCsv(section,data,branches=[]) {
 const safe = value=>escapeCsvCell(value)
 return ['Group,Metric,Value',...sectionRows(section,data,branches).map(row=>row.map(safe).join(','))].join('\r\n')
}
const sheet=(name,headers,rows)=>({name,headers,rows})
export function reportTables(reports,{branchName,from,to,branches=[]}={}) {
 if(REPORT_SECTIONS.some(x=>!reports?.[x.value])) throw new Error('All report sections must be available before exporting.')
 const a=reports.appointments, f=reports.financial, s=reports.services, i=reports.inventory
 return [
  sheet('Report Info',['Setting','Value'],context(branchName,from,to)),
  sheet('Overview',['Group','Metric','Value'],sectionRows('overview',reports.overview,branches)),
  sheet('Appointments',['Group','Metric','Value'],sectionRows('appointments',a)),
  sheet('Financial',['Group','Metric','Value'],sectionRows('financial',f)),
  sheet('Payment Methods',['Method','Transactions','Gross','Voided','Refunded','Net'],(f.payments_by_method||[]).map(r=>[r.payment_method,r.transactions,r.gross,r.voided,r.refunded,r.net])),
  sheet('Doctors',['Branch','Doctor','Appointments','Patients','Completed','No Shows'],(s.doctors||[]).map(r=>[r.branch_name,r.name,r.appointments,r.patients,r.completed,r.no_show])),
  sheet('Services',['Branch','Service','Bills','Quantity','Billed'],(s.services||[]).map(r=>[r.branch_name,r.name,r.bills,r.quantity,r.gross_billed])),
  sheet('Promotions',['Branch','Promotion','Bills','Savings'],(s.promotions||[]).map(r=>[r.branch_name,r.name,r.bills,r.discounts])),
  sheet('Inventory',['Group','Metric','Value'],sectionRows('inventory',i)),
  sheet('Stock Usage',['Branch ID','Item','Unit','Quantity Used'],(i.most_used||[]).map(r=>[r.branch_id,r.name,r.unit,r.quantity])),
  sheet('Stock Movements',['Type','Actions','Quantity'],(i.movements||[]).map(r=>[r.name,r.actions,r.quantity])),
  sheet('Stock Rooms',['Branch','Room','Type','Products','Current Quantity'],(i.stockrooms||[]).map(r=>[r.branch_name,r.name,r.location_type,r.products,r.quantity])),
 ]
}
export const reportWorkbookSheets = reportTables
