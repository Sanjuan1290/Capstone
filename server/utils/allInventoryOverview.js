// Read-only inventory presentation metrics. Never mutate stock here.
'use strict'
const dateOnly = v => v instanceof Date ? (Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0,10)) : v ? String(v).slice(0,10) : null
const positive = n => Math.max(0,Number(n)||0)
const statusFor = (row, today, cutoff) => {
  const quantity=Number(row.available_stock ?? row.quantity_base ?? row.stock_base ?? row.stock ?? 0)
  const expiry=dateOnly(row.nearest_expiry)
  const threshold=Number(row.threshold)||0
  return {
    out:quantity<=0,
    low:quantity>0&&quantity<=threshold,
    expired:Boolean(expiry&&expiry<today),
    expiring:Boolean(expiry&&expiry>=today&&expiry<=cutoff),
  }
}
const summaryFor = (rows, groups, branches, today, cutoff30) => {
  const alerts=rows.filter(r=>r.low||r.out||r.expired||r.expiring)
  const nearest=rows.map(r=>dateOnly(r.nearest_expiry)).filter(v=>v&&v>=today).sort()[0]||null
  const top=[...groups].sort((a,b)=>Number(b.selling_value)-Number(a.selling_value))[0]
  return {
    total_items:rows.length, // historical API field: branch-item records
    total_products:groups.length,
    total_units:rows.reduce((s,r)=>s+positive(r.quantity_base),0),
    out_of_stock:rows.filter(r=>r.out).length,
    low_stock:rows.filter(r=>r.low).length,
    expired:rows.filter(r=>r.expired).length,
    expiring_30_days:rows.filter(r=>{const e=dateOnly(r.nearest_expiry);return !!e&&e>=today&&e<=cutoff30}).length,
    branches_with_alerts:new Set(alerts.map(r=>Number(r.branch_id))).size,
    total_selling_value:rows.reduce((s,r)=>s+positive(r.selling_value),0),
    nearest_upcoming_expiry:nearest,
    highest_selling_product:top?.name||null,
    highest_selling_value:top?.selling_value||0,
    branch_count:branches.length,
  }
}
module.exports={dateOnly,statusFor,summaryFor}
