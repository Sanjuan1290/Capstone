export const dateOnly = v => v ? String(v).slice(0,10) : ''
export const money = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(n)||0)
export const number = n => new Intl.NumberFormat('en-PH',{maximumFractionDigits:2}).format(Number(n)||0)
export const statusLabels = item => {
  const out=[]
  if(item?.out)out.push({label:'Out of stock',tone:'danger'})
  if(item?.low)out.push({label:'Low stock',tone:'warning'})
  if(item?.expired)out.push({label:'Expired stock',tone:'danger'})
  else if(item?.expiring)out.push({label:'Expiring soon',tone:'warning'})
  return out.length?out:[{label:'No current alert',tone:'success'}]
}
export const createInventoryCsv = (rows,view) => {
  const csvCell = x => {
    let s=String(x??'')
    if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s
    return '"'+s.replace(/"/g,'""')+'"'
  }
  const headings=['Product','Category','Type',...(view==='by_branch'?['Branch']:[]),'Quantity (base units)','Branches with stock','Alerts','Nearest expiry','Potential selling value (PHP)']
  const lines=rows.map(r=>[
    r.name,r.category,r.item_type,...(view==='by_branch'?[r.branch_name]:[]),r.quantity_base,
    view==='by_branch'?(Number(r.quantity_base)>0?1:0):r.branch_coverage??'',statusLabels(r).map(s=>s.label).join('; '),
    dateOnly(r.nearest_expiry),Number(r.selling_value)||0,
  ])
  return '\uFEFF'+[headings,...lines].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
export const buildFilters = filters => {
  const search=new URLSearchParams()
  for(const [key,value] of Object.entries(filters))if(value!==''&&value!==false&&value!==null&&value!==undefined)search.set(key,String(value))
  return search.toString()
}
