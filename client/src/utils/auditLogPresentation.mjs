// The order mirrors server/utils/auditArea.js. Keep category behavior in sync.
export const AUDIT_AREAS = [
  { value: 'account_security', label: 'Accounts & Security' },
  { value: 'patients', label: 'Patients' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'doctor_operations', label: 'Doctor Operations' },
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'services_pricing', label: 'Services & Pricing' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'reports', label: 'Reports & Exports' },
  { value: 'settings', label: 'System Settings' },
  { value: 'audit', label: 'Audit & Administration' },
]
const codeLabels = Object.fromEntries(AUDIT_AREAS.map(({ value, label }) => [value, label]))
const areaAliases = { service_catalog: 'services_pricing', clinical: 'doctor_operations', doctor_schedule: 'doctor_operations', stock_transfers: 'inventory', clinic_settings: 'settings' }
export const areaFromEvent = (row) => {
  const area = areaAliases[row?.area_code] || row?.area_code
  if (area && codeLabels[area]) return area
  const action = String(row?.action || '').toLowerCase()
  const type = String(row?.entity_type || '').toLowerCase()
  if (/^(auth\.|security\.|account\.|password_)/.test(action) || ['admin','staff','doctor','patient','user_account'].includes(type)) return 'account_security'
  if (/^(catalog\.|system\.service_category_|service\.)/.test(action) || ['billing_service','billing_service_category','billing_service_material'].includes(type)) return 'services_pricing'
  if (/^patient\./.test(action) || ['patient_profile','patient_record'].includes(type)) return 'patients'
  if (/^(appointment\.|queue\.)/.test(action) || ['appointment','appointment_cancellation_reason','queue'].includes(type)) return 'appointments'
  if (/^(clinical\.|schedule\.|prescription\.)/.test(action) || ['consultation','prescription_document','doctor_schedule','doctor_unavailable_date'].includes(type)) return 'doctor_operations'
  if (/^(inventory\.|supply\.|system\.uom_|system\.supplier_)/.test(action) || ['inventory_item','inventory_movement_reason','inventory_batch','inventory_stock','inventory_uom','inventory_supplier','inventory_location','inventory_location_type','supply_request','supply_request_group'].includes(type)) return 'inventory'
  if (/^(billing\.|payment\.|cashier\.)/.test(action) || ['billing_record','billing_payment','billing_adjustment_request','cashier_closing','discount_preset','clinic_payment_settings','billing_payment_refund'].includes(type)) return 'billing'
  if (/^(announcement\.|marketing\.|campaign\.)/.test(action) || ['announcement','campaign','branch_announcement','marketing_campaign','promotion'].includes(type)) return 'announcements'
  if (/^reports?\./.test(action) || type === 'report') return 'reports'
  if (/^(settings\.|booking\.policy_|system\.)/.test(action) || ['clinic_settings','booking_policy','booking_settings','branch_settings'].includes(type)) return 'settings'
  if (/^audit\./.test(action) || ['audit_archive','audit_log'].includes(type)) return 'audit'
  return 'other'
}
export const areaLabel = (row) => codeLabels[areaFromEvent(row)] || 'Other Activity'
export const eventOutcome = (row) => {
  if (row?.display_outcome) return row.display_outcome
  if (row?.outcome && row.outcome !== 'success') return row.outcome
  return /(?:needs_review|verification_requested|_pending)$/.test(String(row?.action || '')) ? 'pending' : /(?:login_failed|_failed|_blocked|_denied)$/.test(String(row?.action || '')) ? 'failure' : (row?.outcome || 'success')
}

const SAFE_FIELDS = new Set([
  'status','is_active','clinic_type','category','category_name','service_name','item_name','name',
  'price','default_price','selling_price','unit_price','low_stock_threshold','low_stock_alert',
  'quantity','qty','qty_requested','old_quantity','new_quantity','minimum_stock','uom',
  'payment_method','payment_amount','amount','refund_delta','refund_amount',
  'discount_amount','discount_percent','discount_type','sub_total','total_amount',
  'appointment_date','appointment_time','unavailable_date','start_time','end_time','day_of_week',
  'expiration_date','batch_code','batch_id','location','location_id','source_location',
  'destination_location','item_count','is_24_hours','is_completed','branch_id','reason_code',
  'provider_status','payment_status','requested_service_id','service_id', 'sort_order',
])
const SENSITIVE = /(?:password|secret|token|email|phone|address|diagnos|symptom|medical|prescription|patient_name|contact|history|notes?|message|reason$|image|file|document_body|signature|cookie|session|key|otp)/i
const labels = {
  status:'Status',is_active:'Active',name:'Name',category:'Category',default_price:'Starting Price',
  selling_price:'Selling Price',unit_price:'Unit Price',low_stock_threshold:'Low Stock Alert',
  low_stock_alert:'Low Stock Alert',qty:'Quantity',qty_requested:'Quantity Requested',
  payment_method:'Payment Method',payment_amount:'Payment Amount',appointment_date:'Appointment Date',
  appointment_time:'Appointment Time',discount_amount:'Discount',discount_percent:'Discount (%)',
  destination_location:'Destination Stock Room', source_location:'Source Stock Room',
}
const label = (key) => labels[key] || String(key).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
export const safeChanges = (oldValue, newValue, area = '') => {
  const before = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue) ? oldValue : {}
  const after = newValue && typeof newValue === 'object' && !Array.isArray(newValue) ? newValue : {}
  const keys = [...new Set([...Object.keys(before),...Object.keys(after)])]
  return keys.filter(key => SAFE_FIELDS.has(key) && !SENSITIVE.test(key) && !(['doctor_operations','patients'].includes(area) && key === 'name'))
    .filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .slice(0, 25).map(key => ({
      field: key, label: label(key), before: before[key] ?? null, after: after[key] ?? null,
    }))
}
export const formatAuditValue = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return 'Updated'
  if (String(value).length > 140) return `${String(value).slice(0, 140)}…`
  return String(value)
}
export const simpleActionLabel = (action) => {
  const parts = String(action || 'activity').split('.')
  return String(parts[parts.length - 1]).replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}
